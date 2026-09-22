/* Ranger Hawk backend - the smallest server that makes two things possible the
   phone alone cannot do: (1) alert a contact when a hunter is overdue and the
   phone never found signal again; (2) keep a hunter's trail camera photos and
   tags somewhere other than one phone.

   Cloudflare Worker + D1 (rows) + R2 (photos) + Resend (email). No passwords:
   sign in with a 6-digit code sent by email; the phone keeps a long token.
   Every row belongs to one user and is never readable by another - there is
   no sharing here yet, on purpose (Utah's trail camera data rule, R657-5-7).
   NOT DEPLOYED. See wrangler.toml. */

const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': 'https://rangerhawk.com', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', ...extra } });
const now = () => Math.floor(Date.now() / 1000);
const rid = () => crypto.randomUUID();

async function sendEmail(env, to, subject, text) {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, text }) });
  if (!r.ok) throw new Error('email failed ' + r.status);
}
async function user(env, req) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!t) return null;
  return env.DB.prepare('SELECT u.id, u.email FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?').bind(t).first();
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return json({}, 204);
    const url = new URL(req.url), p = url.pathname, body = req.method === 'POST' || req.method === 'PUT' ? await req.clone().json().catch(() => ({})) : {};

    // --- sign in: email -> code -> token ------------------------------------
    if (p === '/v1/login' && req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'email' }, 400);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await env.DB.prepare('INSERT INTO codes (email, code, expires) VALUES (?, ?, ?)').bind(email, code, now() + 600).run();
      await sendEmail(env, email, 'Your Ranger Hawk code: ' + code, `Your sign-in code is ${code}. It works for 10 minutes. If you did not ask for it, ignore this.`);
      return json({ ok: true });
    }
    if (p === '/v1/code' && req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase(), code = String(body.code || '');
      const row = await env.DB.prepare('SELECT 1 FROM codes WHERE email = ? AND code = ? AND expires > ?').bind(email, code, now()).first();
      if (!row) return json({ error: 'code' }, 401);
      let u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (!u) { u = { id: rid() }; await env.DB.prepare('INSERT INTO users (id, email, created) VALUES (?, ?, ?)').bind(u.id, email, now()).run(); }
      const token = rid() + rid();
      await env.DB.prepare('INSERT INTO tokens (token, user_id, device, created) VALUES (?, ?, ?, ?)').bind(token, u.id, String(body.device || '').slice(0, 80), now()).run();
      await env.DB.prepare('DELETE FROM codes WHERE email = ?').bind(email).run();
      return json({ token });
    }

    const me = await user(env, req);
    if (!me) return json({ error: 'sign in' }, 401);

    // --- trip plans: the phone posts the plan before losing signal ----------
    if (p === '/v1/plan' && req.method === 'POST') {
      const id = String(body.id || rid()), back = Math.floor(Date.parse(body.back || '') / 1000);
      if (!back) return json({ error: 'back_by' }, 400);
      await env.DB.prepare('INSERT OR REPLACE INTO plans (id, user_id, plan, back_by, contact_email, contact_phone, safe, alerted, created) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)')
        .bind(id, me.id, String(body.text || '').slice(0, 4000), back, body.contact_email || null, body.contact_phone || null, now()).run();
      return json({ ok: true, id });
    }
    if (p === '/v1/plan/safe' && req.method === 'POST') {           // "I'm back" - also stops any pending alert
      await env.DB.prepare('UPDATE plans SET safe = 1 WHERE id = ? AND user_id = ?').bind(String(body.id || ''), me.id).run();
      return json({ ok: true });
    }

    // --- camera vault: photos to R2, rows to D1 ------------------------------
    const m = /^\/v1\/photo\/([\w.-]+)\/([\w.%-]+)$/.exec(p);
    if (m && req.method === 'PUT') {
      const key = `${me.id}/${m[1]}/${decodeURIComponent(m[2])}`, buf = await req.arrayBuffer();
      if (buf.byteLength > 3_000_000) return json({ error: 'too big' }, 413);
      await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: req.headers.get('content-type') || 'image/jpeg' } });
      await env.DB.prepare('INSERT OR REPLACE INTO photos (id, user_id, site, taken, tag, n, bytes, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(key, me.id, m[1], req.headers.get('x-taken') || null, req.headers.get('x-tag') || null, +(req.headers.get('x-n') || 1), buf.byteLength, now()).run();
      return json({ ok: true, key });
    }
    if (m && req.method === 'GET') {
      const key = `${me.id}/${m[1]}/${decodeURIComponent(m[2])}`, obj = await env.PHOTOS.get(key);
      if (!obj) return json({ error: 'not found' }, 404);
      return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata.contentType || 'image/jpeg', 'access-control-allow-origin': 'https://rangerhawk.com', 'cache-control': 'private, max-age=86400' } });
    }
    if (p === '/v1/photos' && req.method === 'GET') {
      const rows = await env.DB.prepare('SELECT id, site, taken, tag, n, bytes FROM photos WHERE user_id = ? ORDER BY taken').bind(me.id).all();
      return json({ photos: rows.results });
    }
    if (p === '/v1/photo/tag' && req.method === 'POST') {
      await env.DB.prepare('UPDATE photos SET tag = ?, n = ? WHERE id = ? AND user_id = ?').bind(body.tag || null, +(body.n || 1), String(body.id || ''), me.id).run();
      return json({ ok: true });
    }
    return json({ error: 'no such route' }, 404);
  },

  // Every 10 minutes: anyone past back-by, not marked safe, not yet alerted -> email the contact.
  async scheduled(ev, env) {
    const due = await env.DB.prepare('SELECT p.*, u.email AS hunter FROM plans p JOIN users u ON u.id = p.user_id WHERE p.safe = 0 AND p.alerted = 0 AND p.back_by < ?').bind(now()).all();
    for (const r of due.results) {
      const when = new Date(r.back_by * 1000).toLocaleString('en-US', { timeZone: 'America/Denver' });
      const text = `${r.hunter} planned to be back by ${when} (Mountain time) and has not checked in.\n\nTheir trip plan:\n${r.plan}\n\nCall them first. If they do not answer, call the county sheriff (in Utah, 911 and ask for Search and Rescue) and read them the plan. This is an automatic message from Ranger Hawk; nobody has confirmed anything is wrong.`;
      try {
        if (r.contact_email) await sendEmail(env, r.contact_email, `Overdue: ${r.hunter} has not checked in`, text);
        // SMS: add a Twilio call here once an account and a number exist (TWILIO_* secrets).
        await env.DB.prepare('UPDATE plans SET alerted = 1 WHERE id = ?').bind(r.id).run();
      } catch (e) { /* try again next run */ }
    }
  }
};
