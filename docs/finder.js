/* Ranger Hawk - hunt finder. "I want to hunt elk by my cabin" -> the hunts that
   exist there this year, with dates, permit type and last year's draw odds.
   Works with no signal: it reads the place, the species and the weapon out of
   the sentence, finds the hunt units under that place with the unit shapes the
   app already carries, then matches them to UDWR's 2026 hunt lists and the draw
   results. It asks a question when something is missing rather than guessing.
   Loaded after app.js; shares its globals. */
'use strict';

let HU = null;                         // hunt_units_2026.json
let fq = { text: '', sp: null, wp: null, place: null, pt: null, units: null, ask: null };
const F_SPECIES = [['elk', /\belk|bull|spike|cow elk\b/], ['deer', /\bdeer|buck|muley|mule\b/], ['pronghorn', /\bpronghorn|antelope|goat(?!\s*mountain)|speed goat\b/],
  ['moose', /\bmoose\b/], ['sheep', /\bsheep|bighorn|ram\b/], ['mountain goat', /\bmountain goat|mtn goat\b/], ['bison', /\bbison|buffalo\b/]];
const F_WEAPON = [['archery', /\barch|bow\b/], ['muzzleloader', /\bmuzz|smoke ?pole\b/], ['rifle', /\brifle|any legal|alw|gun\b/]];
const F_LABEL = { elk: 'Elk', deer: 'Deer', pronghorn: 'Pronghorn', moose: 'Moose', sheep: 'Bighorn sheep', 'mountain goat': 'Mountain goat', bison: 'Bison' };

function fLoad() {
  if (!HU) fetch('data/hunt_units_2026.json').then(r => r.json()).then(j => { HU = j; if (tab === 'seasons') render(); }).catch(() => { HU = { hunts: {} }; });
  if (!ODDS) loadOdds();
  if (!UNITS) fetch('data/units_geo.json').then(r => r.json()).then(j => { UNITS = j.units; if (tab === 'seasons') render(); }).catch(() => {});
}
/* Read the sentence. Anything not found becomes a question. */
function fParse(text) {
  const t = ' ' + text.toLowerCase().replace(/[^a-z0-9 ,'-]/g, ' ') + ' ';
  const q = { text, sp: null, wp: null, place: null, pt: null, wantAntlerless: /\b(cow|antlerless|doe|meat|freezer)\b/.test(t), wantGeneral: /\b(general|over the counter|otc|no draw|guaranteed)\b/.test(t), wantLE: /\b(limited|draw|le |trophy|bonus)\b/.test(t) };
  for (const [k, re] of F_SPECIES) if (re.test(t)) { q.sp = k; break; }
  for (const [k, re] of F_WEAPON) if (re.test(t)) { q.wp = k; break; }
  const m = /(\d{1,2})\s*(?:bonus|preference)?\s*(?:points?|pts)/.exec(t); if (m) q.pt = +m[1];
  for (const h of (DB.config.homes || [])) if ((h.aliases || []).some(a => t.includes(' ' + a + ' ') || t.includes(' ' + a + ',') || t.includes('my ' + a))) { q.place = { kind: 'home', id: h.id, label: h.label, lat: h.lat, lon: h.lon }; break; }
  if (!q.place && /\b(here|where i am|my location|gps|right now)\b/.test(t)) q.place = { kind: 'gps' };
  if (!q.place && UNITS) {                                   // a unit named outright, longest match wins
    const hit = UNITS.map(u => u.n).filter(n => t.includes(' ' + n.toLowerCase().split(',')[0] + ' ') || t.includes(' ' + n.toLowerCase() + ' ')).sort((a, b) => b.length - a.length)[0];
    if (hit) q.place = { kind: 'unit', label: hit, units: UNITS.filter(u => u.n.split(',')[0] === hit.split(',')[0]).map(u => u.n) };
  }
  return q;
}
const fBase = n => (n || '').split(',')[0].replace(/\s*\(.*\)\s*/, '').trim().toLowerCase();
/* Exact unit match, or a whole-unit hunt when I am in one of its sub-units. A
   sub-unit hunt when I am only known to be in the parent is a maybe. */
const fUnitMatch = (huntUnit, myUnits) => {
  const hu = huntUnit.toLowerCase(), hb = fBase(huntUnit), huSub = hu.includes(',');
  for (const u of myUnits) {
    const ul = u.toLowerCase(), ub = fBase(u);
    if (ul === hu) return 'yes';
    if (!huSub && ub === hb) return 'yes';                       // hunt is the whole unit, I am in a part of it
  }
  return myUnits.some(u => fBase(u) === hb) ? 'maybe' : '';
};
const fSeason = id => (DB.seasons.seasons || []).find(s => s.id === id);
const fDates = id => { const s = fSeason(id); return s ? `${fmt(d0(s.start))} to ${fmt(d0(s.end))}` : ''; };
function fOddsLine(h) {                                       // last year's result at the user's points, if they set them
  if (!ODDS) return '';
  const grp = h.g, key = grp + '|' + h.s, pts = fq.pt != null ? fq.pt : (draw.pts[key] != null ? draw.pts[key] : null);
  if (pts == null) return '<span class="s">Set your points to see last year\'s odds.</span>';
  const o = oddsAt(h, pts); return `<span class="s">${pts} pt${pts === 1 ? '' : 's'} last year: <b>${esc(o.txt)}</b>${o.pct != null ? ' (' + o.pct + '%)' : ''}</span>`;
}
function fResults(q, myUnits) {
  const out = [], H = HU.hunts, yr = ODDS ? Object.keys(ODDS.years).sort().pop() : null, hunts = yr ? Object.entries(ODDS.years[yr]) : [];
  const inList = k => (H[k] || []).map(r => Object.assign({}, r, { m: fUnitMatch(r.unit, myUnits) })).filter(r => r.m);
  const sub = r => r.m === 'maybe' ? ' <i>(a part of this unit - check the boundary on the map)</i>' : '';
  const wpOk = name => !q.wp || (q.wp === 'archery' ? /archery/i : q.wp === 'muzzleloader' ? /muzz/i : /any legal|rifle|alw/i).test(name);
  const card = (title, rows) => rows.length && out.push({ title, rows });
  if (!q.sp || q.sp === 'elk') {
    const ab = inList('elk_anybull'), sp = inList('elk_spike'), rows = [];
    for (const u of ab) {
      if (wpOk('archery')) rows.push({ t: `Any-bull elk, general archery - ${u.unit}`, sub: sub(u), s: `${fDates('elk-archery-anybull')}. Over the counter. Any bull or antlerless.` });
      if (wpOk('rifle')) rows.push({ t: `Any-bull elk, general rifle - ${u.unit}`, sub: sub(u), s: `Early ${fDates('elk-early-rifle')} or late ${fDates('elk-late-rifle')}. Over the counter; pick one.` });
      if (wpOk('muzzleloader')) rows.push({ t: `Any-bull elk, general muzzleloader - ${u.unit}`, sub: sub(u), s: `${fDates('elk-muzz')}. Over the counter.` });
    }
    for (const u of sp) {
      if (wpOk('archery')) rows.push({ t: `Spike elk, general archery - ${u.unit}`, sub: sub(u), s: `${fDates('elk-archery-spike')}. Over the counter. Spike or antlerless only.` });
      if (wpOk('rifle')) rows.push({ t: `Spike elk, general rifle - ${u.unit}`, sub: sub(u), s: `${fDates('elk-spike-rifle')}. Over the counter. Spike only - a branched bull here is a citation.` });
      if (wpOk('muzzleloader')) rows.push({ t: `Spike elk, general muzzleloader - ${u.unit}`, sub: sub(u), s: `${fDates('elk-muzz')}. Over the counter.` });
    }
    if (!q.wantLE || q.wantGeneral) card('Elk you can buy over the counter', rows);
    const ctl = inList('antlerless_elk_control'); if (ctl.length && (q.wantAntlerless || !q.wantLE)) card('Antlerless elk control permits here', ctl.map(u => ({ t: `Antlerless elk control - ${u.unit}`, s: 'Sold separately; check dates and quota at wildlife.utah.gov/biggame.', sub: sub(u) })));
  }
  if (!q.sp || q.sp === 'deer') {
    const g = inList('deer_gen'), rows = [];
    for (const u of g) {
      const ex = /extended/i.test(u.unit);
      if (wpOk('archery')) rows.push({ t: `General buck deer, archery - ${u.unit}`, sub: sub(u), s: `${fDates('deer-archery')}. Drawn with preference points (most units draw at 0-1 point). Extended archery ${fDates('deer-ext-archery')} on the Wasatch Front and others.` });
      if (wpOk('muzzleloader')) rows.push({ t: `General buck deer, muzzleloader - ${u.unit}`, sub: sub(u), s: `${fDates('deer-muzz')}. Drawn with preference points.` });
      if (wpOk('rifle')) rows.push({ t: `General buck deer, rifle - ${u.unit}`, sub: sub(u), s: `Early ${fDates('deer-early-rifle')} or ${fDates('deer-rifle')}. Drawn with preference points.` });
    }
    if (!q.wantLE || q.wantGeneral) card('Deer - general season (draw, preference points)', rows);
  }
  // Draw hunts from last year's results, matched by unit name in the hunt title
  const spMap = { elk: ['EB', 'EA'], deer: ['DB', 'DA'], pronghorn: ['PB', 'PD', 'PA'], moose: ['MB', 'MA'], sheep: ['DS', 'RS', 'RE', 'DE'], 'mountain goat': ['GO'], bison: ['BI'] };
  const want = q.sp ? spMap[q.sp] : null;
  const drawRows = hunts.filter(([c, h]) => (!want || want.includes(c.slice(0, 2))) && wpOk(h.n) && (!q.wantAntlerless || h.g === 'Antlerless') && (!q.wantGeneral || h.g !== 'Limited entry and once-in-a-lifetime'))
    .map(([c, h]) => { const segs = h.n.split(' - '); const unit = h.g === 'General-season buck deer' ? segs[0] : (segs[1] || ''); return [c, h, fUnitMatch(unit, myUnits)]; }).filter(x => x[2])
    .map(([c, h, m]) => ({ t: h.n + (m === 'maybe' ? ' (part of the unit - check the boundary)' : ''), s: `${esc(c)} &middot; ${h.g}${h.k === 'p' ? ' &middot; preference points' : ' &middot; bonus points'}. ${fOddsLine(h)}`, code: c }));
  if (!q.wantGeneral) card(`Draw hunts here (${yr || 'last year'} results)`, drawRows.slice(0, 40));
  return out;
}
function vFind() {
  fLoad();
  const q = fq.parsed || null;
  let h = `<form id="findform" style="margin-top:12px"><input class="search" id="findq" placeholder="I want to hunt elk by my cabin with a rifle" value="${esc(fq.text)}"><div class="acts" style="padding:8px 0 0"><button class="btn" type="submit">Find hunts</button></div></form>
    <p class="fine" style="padding-left:2px">Try: "elk by the cabin", "archery deer near Torrey", "cow elk where I am", "limited entry elk Wasatch, 7 points". Works with no signal.</p>`;
  if (!q) return h;
  if (!HU || !UNITS) return h + '<p class="empty">Loading the hunt lists&hellip;</p>';
  // Questions first
  if (!q.sp) return h + fAsk('What do you want to hunt?', Object.entries(F_LABEL).map(([k, l]) => [k, l]), 'sp');
  if (!q.place) return h + fAsk('Where?', (DB.config.homes || []).map(x => [x.id, x.label]).concat([['gps', 'Where I am now']]), 'place') + '<p class="fine" style="padding-left:2px">Or name a unit in the sentence, like "Wasatch Mtns" or "Book Cliffs".</p>';
  if (q.place.kind === 'gps' && !q.place.lat) return h + `<p class="empty">Getting a GPS fix&hellip;</p>`;
  const myUnits = q.place.units || (q.place.lat ? unitsAt(q.place.lon, q.place.lat).map(u => u.n) : []);
  if (!myUnits.length) return h + `<p class="empty">No hunt boundary found under ${esc(q.place.label || 'that spot')}. Try naming a unit.</p>`;
  const res = fResults(q, myUnits);
  h += `<div class="sec-title">${esc(F_LABEL[q.sp])}${q.wp ? ' &middot; ' + esc(q.wp) : ''} &middot; ${esc(q.place.label || 'here')}</div>
    <p class="fine" style="padding-left:2px">Hunt boundaries under that spot: <b>${myUnits.map(esc).join(', ')}</b>. One place can sit in several overlapping hunts, so check the boundary on the map before you buy.</p>`;
  if (!q.wp) h += fAsk('Which weapon? (or leave it open)', [['archery', 'Archery'], ['muzzleloader', 'Muzzleloader'], ['rifle', 'Rifle / any legal weapon'], ['any', 'Show all']], 'wp');
  for (const c of res) h += `<div class="sec-title">${esc(c.title)}</div><div class="card">${c.rows.map(r => `<${r.code ? 'button' : 'div'} class="row" ${r.code ? `data-draw="${esc(r.code)}"` : ''} style="--g:var(--brand)"><span class="pill"></span><span><span class="t">${esc(r.t)}${r.sub || ''}</span><span class="s">${r.s}</span></span><span class="v"></span></${r.code ? 'button' : 'div'}>`).join('')}</div>`;
  if (!res.length) h += `<p class="empty">Nothing matched in ${myUnits.map(esc).join(', ')} for ${esc(F_LABEL[q.sp])}${q.wp ? ' with ' + q.wp : ''}. Try another weapon or drop the extra words.</p>`;
  h += `<p class="fine" style="padding-left:2px">General dates from the 2026 guidebook; unit lists from UDWR's 2026 hunt boundaries; draw odds from UDWR's published results. Over-the-counter permits still have sale dates and, for some hunts, caps. Confirm at wildlife.utah.gov before you buy.</p>`;
  return h;
}
const fAsk = (question, opts, key) => `<div class="sec-title">${esc(question)}</div><div class="chipsrow">${opts.map(([v, l]) => `<button class="chip" data-fask="${key}" data-fval="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
function fRun(text) {
  fq.text = text; fq.parsed = fParse(text);
  if (fq.parsed.place && fq.parsed.place.kind === 'gps' && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(p => { fq.parsed.place = { kind: 'gps', label: 'where I am', lat: p.coords.latitude, lon: p.coords.longitude }; render(); },
      () => { fq.parsed.place = null; render(); }, { enableHighAccuracy: true, timeout: 15000 });
  }
  render();
}
document.addEventListener('submit', e => { if (e.target.id === 'findform') { e.preventDefault(); fRun($('findq').value.trim()); } });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-fask]'); if (!t) return;
  const q = fq.parsed || fParse(''); const v = t.dataset.fval;
  if (t.dataset.fask === 'sp') q.sp = v;
  if (t.dataset.fask === 'wp') q.wp = v === 'any' ? null : v, q.wpAsked = true;
  if (t.dataset.fask === 'place') { const h = (DB.config.homes || []).find(x => x.id === v); q.place = h ? { kind: 'home', id: h.id, label: h.label, lat: h.lat, lon: h.lon } : { kind: 'gps' }; if (!h) { fq.parsed = q; fRun(fq.text); return; } }
  fq.parsed = q; render();
});
