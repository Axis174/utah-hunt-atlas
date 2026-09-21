/* Ranger Hawk - offline-first personal hunting reference. */
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const DAY = 86400000;
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const d0 = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const days = (a, b) => Math.round((b - a) / DAY);
const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const GC = { bird: 'var(--bird)', deer: 'var(--deer)', elk: 'var(--elk)', turkey: 'var(--turkey)' };

let DB = { birds: [], seasons: null, config: null, community: null };
let home = 'nsl';
let tab = 'today';
let query = '';
let speciesFilter = new Set();

try { home = localStorage.getItem('ha.home') || 'nsl'; } catch (e) { /* private mode */ }

/* ---------------------------------------------------------------- data ---- */
async function load() {
  const grab = async (f, dflt) => {
    try {
      const r = await fetch('data/' + f, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      return j && j.offline ? dflt : j;
    } catch (e) { return dflt; }
  };
  const [b, s, c, com] = await Promise.all([
    grab('bird_access.json', []), grab('seasons.json', null),
    grab('config.json', null), grab('community.json', null)
  ]);
  DB = { birds: b || [], seasons: s, config: c, community: com };
  if (!DB.seasons || !DB.config) {
    $('view').innerHTML = '<p class="empty">Data could not load and nothing is cached yet.' +
      '<br>Open this once with a connection, then it works offline.</p>';
    return false;
  }
  return true;
}

/* -------------------------------------------------------------- derive ---- */
function seasonState(s) {
  const t = today(), a = d0(s.start), b = d0(s.end);
  if (t >= a && t <= b) return { k: 'open', n: days(t, b), label: 'Open, ' + days(t, b) + 'd left' };
  if (t < a) { const n = days(t, a); return { k: n <= 21 ? 'soon' : 'shut', n, label: 'Opens in ' + n + 'd' }; }
  return { k: 'shut', n: -1, label: 'Closed' };
}
function deadlineState(dl) {
  const n = days(today(), d0(dl.date));
  const lead = Math.max(...(dl.lead_days || [7]));
  return { n, k: n < 0 ? 'shut' : n <= 3 ? 'crit' : n <= lead ? 'soon' : 'open' };
}
function upcoming() {
  return (DB.seasons.deadlines || [])
    .map(d => ({ d, st: deadlineState(d) }))
    .filter(x => x.st.n >= 0)
    .sort((a, b) => a.st.n - b.st.n);
}
function openNow() {
  return (DB.seasons.seasons || [])
    .map(s => ({ s, st: seasonState(s) }))
    .filter(x => x.st.k === 'open')
    .sort((a, b) => a.st.n - b.st.n);
}
function alerts() {
  return upcoming().filter(x => x.st.k === 'crit' || x.st.k === 'soon').length;
}
function drive(p) {
  const d = (p.drive || {})[home];
  if (!d) return { txt: '--', sub: '', mins: 1e9 };
  if (d.range) return { txt: d.range[0] + '-' + d.range[1], sub: 'min *', mins: d.range[0] };
  return { txt: String(d.min), sub: 'min', mins: d.min };
}

/* ---------------------------------------------------------------- views --- */
function vToday() {
  const up = upcoming(), on = openNow();
  const next = up[0];
  let h = '';
  if (next) {
    const n = next.st.n;
    h += `<div class="hero">
      <div class="lab">Next deadline</div>
      <div class="big">${n === 0 ? 'Today' : n + ' day' + (n === 1 ? '' : 's')}</div>
      <div class="sub">${esc(next.d.title)} &middot; ${fmt(d0(next.d.date))}</div></div>`;
  }
  h += `<div class="sec-title">Open right now</div><div class="card">`;
  h += on.length ? on.map(x => `<button class="row" data-season="${esc(x.s.id)}" style="--g:${GC[x.s.group] || 'var(--accent)'}">
      <span class="pill"></span>
      <span><span class="t">${esc(x.s.name)}</span><span class="s">${esc(x.s.bag || x.s.area || '')}</span></span>
      <span class="v">${x.st.n}<small>days left</small></span></button>`).join('')
    : '<p class="empty">Nothing open today.</p>';
  h += `</div>`;

  h += `<div class="sec-title">Closest access from ${esc(hlabel())}</div><div class="card">`;
  const near = DB.birds.slice().sort((a, b) => drive(a).mins - drive(b).mins).slice(0, 5);
  h += near.map(p => rowPoint(p)).join('') || '<p class="empty">No access data.</p>';
  h += `</div>`;

  h += `<div class="sec-title">What is coming</div><div class="card">`;
  h += up.slice(0, 6).map(x => `<button class="row" data-dl="${esc(x.d.id)}" style="--g:var(--accent)">
      <span class="pill"></span>
      <span><span class="t">${esc(x.d.title)}</span>
      <span class="s">${fmt(d0(x.d.date))}${x.d.projected ? ' &middot; projected' : ''}</span></span>
      <span class="v"><span class="state ${x.st.k}">${x.st.n}d</span></span></button>`).join('');
  h += `</div>`;
  return h;
}

function rowPoint(p) {
  const d = drive(p);
  const grp = p.species && /ptarmigan|duck|chukar|pheasant|quail|partridge/i.test(p.species) ? 'bird' : 'bird';
  return `<button class="row" data-pt="${esc(p.id)}" style="--g:${GC[grp]}">
    <span class="pill"></span>
    <span><span class="t">${esc(p.name)}</span>
    <span class="s">${esc(p.county)} Co. &middot; ${esc(p.species)}</span></span>
    <span class="v">${d.txt}<small>${d.sub}</small></span></button>`;
}

function vAccess() {
  const cats = [...new Set(DB.birds.map(p => p.species))].sort();
  let h = `<input class="search" id="q" placeholder="Search access by name or county" value="${esc(query)}">`;
  h += `<div class="chips">` + cats.map(c =>
    `<button class="chip" data-sp="${esc(c)}" aria-pressed="${speciesFilter.has(c)}" style="--g:var(--bird)"><i></i>${esc(c)}</button>`
  ).join('') + `</div>`;
  let list = DB.birds.filter(p => {
    if (speciesFilter.size && !speciesFilter.has(p.species)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (p.name + ' ' + p.county + ' ' + p.species + ' ' + p.access_type).toLowerCase().includes(q);
  }).sort((a, b) => drive(a).mins - drive(b).mins);
  h += `<div class="card"><div class="card-h"><h2>${list.length} places</h2>
    <span class="r">by drive from ${esc(hlabel())}</span></div>`;
  h += list.length ? list.map(rowPoint).join('') : '<p class="empty">Nothing matches.</p>';
  h += `</div><p class="note" style="padding:12px 2px">* A range means the point is a property centroid out in the
    marsh, so routing runs the last miles down dike roads and overstates the drive. Use the low number.</p>`;
  return h;
}

function vSeasons() {
  const groups = ['bird', 'deer', 'elk', 'turkey'];
  let h = '';
  for (const g of groups) {
    const rows = (DB.seasons.seasons || []).filter(s => s.group === g)
      .map(s => ({ s, st: seasonState(s) }))
      .sort((a, b) => d0(a.s.start) - d0(b.s.start));
    if (!rows.length) continue;
    h += `<div class="sec-title">${g === 'bird' ? 'Birds' : g === 'deer' ? 'Deer' : g === 'elk' ? 'Elk' : 'Turkey'}</div><div class="card">`;
    h += rows.map(x => `<button class="row" data-season="${esc(x.s.id)}" style="--g:${GC[g]}">
      <span class="pill"></span>
      <span><span class="t">${esc(x.s.name)}</span>
      <span class="s">${fmt(d0(x.s.start))} &ndash; ${fmt(d0(x.s.end))}</span></span>
      <span class="v"><span class="state ${x.st.k}">${x.st.k === 'open' ? 'open' : x.st.k === 'soon' ? x.st.n + 'd' : '&mdash;'}</span></span></button>`).join('');
    h += `</div>`;
  }
  return h;
}

function vReminders() {
  const up = upcoming();
  const icsUrl = new URL('hunt.ics', location.href).href;
  const webcal = icsUrl.replace(/^https?:/, 'webcal:');
  let h = `<div class="card"><div class="card-h"><h2>Put these on your phone</h2></div><div class="card-b">
    <p class="note">Subscribe once and every season, deadline and landowner call lands in your normal
    calendar with alerts. It refreshes itself twice a day. Nothing to open, nothing to allow.</p>
    <div class="acts" style="padding:14px 0 0">
      <a class="btn" href="${esc(webcal)}">Subscribe in Calendar</a>
      <a class="btn ghost" href="${esc(icsUrl)}">Download .ics</a></div>
    <p class="note" style="margin-top:12px">If the button does nothing: iPhone Settings &rarr; Apps &rarr;
    Calendar &rarr; Calendar Accounts &rarr; Add Account &rarr; Other &rarr; Add Subscribed Calendar,
    and paste<br><span class="mono" style="font-size:11px;word-break:break-all">${esc(icsUrl)}</span></p>
  </div></div>`;

  h += `<div class="sec-title">Every deadline</div><div class="card">`;
  h += up.map(x => `<button class="row" data-dl="${esc(x.d.id)}" style="--g:var(--accent)">
    <span class="pill"></span>
    <span><span class="t">${esc(x.d.title)}</span>
    <span class="s">${fmt(d0(x.d.date))}${x.d.projected ? ' &middot; projected' : ''}</span></span>
    <span class="v"><span class="state ${x.st.k}">${x.st.n}d</span></span></button>`).join('')
    || '<p class="empty">Nothing upcoming.</p>';
  h += `</div>`;

  const perms = (DB.config.permits || []);
  h += `<div class="sec-title">Permits and paperwork</div><div class="card">`;
  h += perms.map(p => `<button class="row" data-permit="${esc(p.id)}" style="--g:${p.new ? 'var(--warn)' : 'var(--accent)'}">
    <span class="pill"></span>
    <span><span class="t">${esc(p.name)}${p.new ? ' &middot; NEW' : ''}</span>
    <span class="s">${esc(p.needed_for)}</span></span>
    <span class="v">${esc(p.cost)}</span></button>`).join('');
  h += `</div>`;
  return h;
}

function vContacts() {
  let h = `<div class="sec-title">Calls that are still open questions</div><div class="card">`;
  h += (DB.config.contacts || []).map(c => `<button class="row" data-contact="${esc(c.name)}" style="--g:${c.priority === 'high' ? 'var(--crit)' : 'var(--accent)'}">
    <span class="pill"></span>
    <span><span class="t">${esc(c.name)}</span><span class="s">${esc(c.why)}</span></span>
    <span class="v">${esc(c.phone)}</span></button>`).join('');
  h += `</div>`;

  h += `<div class="sec-title">Walk-In Access &mdash; landowner contact required</div><div class="card">`;
  h += (DB.config.wia_landowner_calls || []).map((w, i) => `<button class="row" data-wia="${i}" style="--g:var(--warn)">
    <span class="pill"></span>
    <span><span class="t">${esc(w.property)}</span><span class="s">${esc(w.county)} Co. &middot; ${w.acres} ac</span></span>
    <span class="v">call<small>first</small></span></button>`).join('');
  h += `</div>`;

  const L = DB.config.legal || {};
  h += `<div class="sec-title">Before you knock on a door</div><div class="card"><div class="card-b">
    <p class="note"><strong>${esc(L.written_permission || '')}</strong></p>
    <div class="warnbox"><strong>Cultivated</strong> ${esc(L.cultivated || '')}<br><br>
    <strong>Posted</strong> ${esc(L.posted || '')}<br><br>
    <strong>Penalty</strong> ${esc(L.penalty || '')}</div>
    <p class="note" style="margin-top:10px">${esc(L.citation || '')}</p></div></div>`;

  if (DB.community) {
    const items = (DB.community.items || []).slice(0, 12);
    h += `<div class="sec-title">Community chatter</div><div class="card">`;
    h += items.length ? items.map(it => `<a class="row" href="${esc(it.url)}" target="_blank" rel="noopener" style="--g:var(--muted);text-decoration:none">
      <span class="pill"></span>
      <span><span class="t">${esc(it.title)}</span><span class="s">${esc(it.source)}</span></span>
      <span class="v">&rsaquo;</span></a>`).join('') : '<p class="empty">Nothing collected yet.</p>';
    h += `</div>`;
    h += `<div class="sec-title">Check these yourself</div><div class="card">`;
    h += (DB.community.manual_watch || []).map(m => `<a class="row" href="${esc(m.url)}" target="_blank" rel="noopener" style="--g:var(--muted);text-decoration:none">
      <span class="pill"></span><span><span class="t">${esc(m.name)}</span></span><span class="v">&rsaquo;</span></a>`).join('');
    h += `</div><p class="note" style="padding:12px 2px">${esc(DB.community.policy || '')}</p>`;
  }
  return h;
}

/* ---------------------------------------------------------------- sheet --- */
function openSheet(html) {
  $('sheetin').innerHTML = '<div class="grab"></div>' + html;
  $('sheet').hidden = false;
  $('sheetin').scrollTop = 0;
}
function closeSheet() { $('sheet').hidden = true; }

function sheetPoint(p) {
  const d = (p.drive || {});
  const st = k => { const x = d[k]; if (!x) return '--'; return x.range ? x.range[0] + '-' + x.range[1] : x.min; };
  const f = (t, v) => v ? `<dt>${t}</dt><dd>${esc(v)}</dd>` : '';
  const link = /^https?:\/\//i.test((p.contact || '').trim())
    ? `<a href="${esc(p.contact.trim())}" target="_blank" rel="noopener">${esc(p.contact.trim())}</a>`
    : esc(p.contact || '');
  return `<h3>${esc(p.name)}</h3>
    <p class="where">${esc(p.county)} County &middot; ${esc(p.access_type.replace(/_/g, ' '))}</p>
    <div class="stats">
      <div class="stat"><div class="k">N Salt Lake</div><div class="v">${st('nsl')}m</div></div>
      <div class="stat"><div class="k">Heber</div><div class="v">${st('heber')}m</div></div>
      <div class="stat"><div class="k">Torrey</div><div class="v">${st('torrey')}m</div></div>
      <div class="stat"><div class="k">Confidence</div><div class="v" style="font-size:12px">${esc(p.confidence)}</div></div>
    </div>
    <div class="acts">
      <a class="btn" href="https://maps.apple.com/?daddr=${p.lat},${p.lon}&dirflg=d">Directions</a>
      <button class="btn ghost" data-copy="${p.lat}, ${p.lon}">Copy coordinates</button>
    </div>
    <dl class="f">
      ${f('Season', p.season)}${f('Releases', p.stocking)}${f('Restrictions', p.restrictions)}
      ${f('Permits', p.permits)}${f('Managed by', p.agency)}
      ${link ? `<dt>Contact</dt><dd>${link}</dd>` : ''}
      ${f('Notes', p.notes)}
      <dt>Source</dt><dd>${esc(p.source_url)} &middot; retrieved ${esc(p.source_date)}</dd>
    </dl>`;
}
function sheetSeason(s) {
  const st = seasonState(s);
  return `<h3>${esc(s.name)}</h3>
    <p class="where">${fmt(d0(s.start))} &ndash; ${fmt(d0(s.end))} &middot;
      <span class="state ${st.k}">${esc(st.label)}</span></p>
    <dl class="f">
      ${s.bag ? `<dt>Limit</dt><dd>${esc(s.bag)}</dd>` : ''}
      ${s.area ? `<dt>Area open</dt><dd>${esc(s.area)}</dd>` : ''}
      ${s.permit ? `<dt>Needs</dt><dd>${esc(s.permit)}</dd>` : ''}
      ${s.note ? `<dt>Note</dt><dd>${esc(s.note)}</dd>` : ''}
      <dt>Source</dt><dd>${esc(DB.seasons._source)}</dd>
    </dl>`;
}
function sheetDeadline(d) {
  const st = deadlineState(d);
  return `<h3>${esc(d.title)}</h3>
    <p class="where">${fmt(d0(d.date))} &middot; <span class="state ${st.k}">${st.n} days</span></p>
    ${d.projected ? '<div class="warnbox" style="margin:12px 16px 0">Projected date, not yet confirmed by UDWR. The refresh job watches for the official announcement.</div>' : ''}
    <dl class="f"><dt>Detail</dt><dd>${esc(d.detail)}</dd></dl>`;
}

/* --------------------------------------------------------------- render --- */
const TABS = [
  ['today', 'Today', '<path d="M3 10h18M7 3v4M17 3v4"/><rect x="3" y="5" width="18" height="16" rx="2"/>'],
  ['access', 'Access', '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'],
  ['seasons', 'Seasons', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  ['remind', 'Remind', '<path d="M18 8a6 6 0 1 0-12 0c0 7-2 8-2 8h16s-2-1-2-8"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>'],
  ['contacts', 'Contacts', '<path d="M4 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4z"/><circle cx="11" cy="11" r="2.5"/><path d="M7.5 17c.8-1.7 2-2.5 3.5-2.5s2.7.8 3.5 2.5"/>']
];
function hlabel() {
  const h = (DB.config.homes || []).find(x => x.id === home);
  return h ? h.label : home;
}
function renderChrome() {
  $('homesel').innerHTML = (DB.config.homes || []).map(h =>
    `<button data-home="${esc(h.id)}" aria-pressed="${h.id === home}">${esc(h.label.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase())}</button>`
  ).join('');
  const n = alerts();
  $('tabs').innerHTML = TABS.map(([k, label, path]) =>
    `<button data-tab="${k}"${tab === k ? ' aria-current="page"' : ''}>
      <span style="position:relative"><svg viewBox="0 0 24 24">${path}</svg>${k === 'remind' && n ? `<span class="badge">${n}</span>` : ''}</span>
      <span>${label}</span></button>`).join('');
  $('title').textContent = { today: 'Today', access: 'Access', seasons: 'Seasons', remind: 'Reminders', contacts: 'Contacts' }[tab];
}
function render() {
  renderChrome();
  const v = { today: vToday, access: vAccess, seasons: vSeasons, remind: vReminders, contacts: vContacts }[tab];
  $('view').innerHTML = v();
  const q = $('q');
  if (q) {
    q.addEventListener('input', e => { query = e.target.value; const s = e.target.selectionStart; render(); const n = $('q'); if (n) { n.focus(); n.setSelectionRange(s, s); } });
  }
}

/* --------------------------------------------------------------- events --- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-home],[data-pt],[data-season],[data-dl],[data-sp],[data-permit],[data-contact],[data-wia],[data-copy]');
  if (!t) { if (e.target.id === 'sheet') closeSheet(); return; }
  if (t.dataset.tab) { tab = t.dataset.tab; query = ''; render(); window.scrollTo(0, 0); return; }
  if (t.dataset.home) { home = t.dataset.home; try { localStorage.setItem('ha.home', home); } catch (x) {} render(); return; }
  if (t.dataset.sp) { const s = t.dataset.sp; speciesFilter.has(s) ? speciesFilter.delete(s) : speciesFilter.add(s); render(); return; }
  if (t.dataset.pt) { const p = DB.birds.find(x => x.id === t.dataset.pt); if (p) openSheet(sheetPoint(p)); return; }
  if (t.dataset.season) { const s = DB.seasons.seasons.find(x => x.id === t.dataset.season); if (s) openSheet(sheetSeason(s)); return; }
  if (t.dataset.dl) { const d = DB.seasons.deadlines.find(x => x.id === t.dataset.dl); if (d) openSheet(sheetDeadline(d)); return; }
  if (t.dataset.permit) {
    const p = DB.config.permits.find(x => x.id === t.dataset.permit);
    if (p) openSheet(`<h3>${esc(p.name)}</h3><p class="where">${esc(p.cost)}</p>
      <dl class="f"><dt>Needed for</dt><dd>${esc(p.needed_for)}</dd>
      <dt>Where</dt><dd>${esc(p.where)}</dd></dl>`);
    return;
  }
  if (t.dataset.contact) {
    const c = DB.config.contacts.find(x => x.name === t.dataset.contact);
    if (c) openSheet(`<h3>${esc(c.name)}</h3><p class="where">${esc(c.phone)}</p>
      <div class="acts"><a class="btn" href="tel:${esc(c.phone.replace(/[^0-9]/g, ''))}">Call</a></div>
      <dl class="f"><dt>Why</dt><dd>${esc(c.why)}</dd></dl>`);
    return;
  }
  if (t.dataset.wia) {
    const w = DB.config.wia_landowner_calls[+t.dataset.wia];
    if (w) openSheet(`<h3>${esc(w.property)}</h3>
      <p class="where">${esc(w.county)} County &middot; ${w.acres} acres</p>
      <div class="acts"><a class="btn" href="https://maps.apple.com/?daddr=${w.lat},${w.lon}&dirflg=d">Directions</a></div>
      <div class="warnbox" style="margin:14px 16px 0">${esc(w.requirement)}</div>
      <dl class="f"><dt>If denied access</dt><dd>${esc(w.contact || '')}</dd>
      <dt>Coordinates</dt><dd class="mono">${w.lat}, ${w.lon}</dd></dl>`);
    return;
  }
  if (t.dataset.copy) {
    const v = t.dataset.copy;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject())
      .then(() => { t.textContent = 'Copied'; setTimeout(() => { t.textContent = 'Copy coordinates'; }, 1400); })
      .catch(() => { t.textContent = v; });
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

function net() { $('offline').hidden = navigator.onLine; }
window.addEventListener('online', net);
window.addEventListener('offline', net);

load().then(ok => { if (ok) { render(); net(); } });
/* Register the worker, and when a new one takes over, reload once so the
   running page picks up the new shell instead of showing the old one until
   the app is force-quit. */
if ('serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.waiting) reg.waiting.postMessage('skip-waiting');
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            sw.postMessage('skip-waiting');
          }
        });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => {});
  });
}
