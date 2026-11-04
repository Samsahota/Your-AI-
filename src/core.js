/* ==========================================================================
   CORE — utilities, store, permissions, selectors, services, UI primitives
   ========================================================================== */
'use strict';

/* ---------- formatting ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
function gbp(n, opts = {}) {
  if (n == null || isNaN(n)) return '—';
  const neg = n < 0; const v = Math.abs(n);
  const hasPence = opts.pence || Math.round(v * 100) % 100 !== 0;
  const s = v.toLocaleString('en-GB', { minimumFractionDigits: hasPence ? 2 : 0, maximumFractionDigits: hasPence ? 2 : 0 });
  return (neg ? '−' : (opts.sign && n > 0 ? '+' : '')) + '£' + s;
}
const pct = (n, dp = 1) => (n == null || isNaN(n)) ? '—' : n.toFixed(dp) + '%';
const int = n => Number(n).toLocaleString('en-GB');
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAYS_L = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_L = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const toD = s => new Date(s.length === 10 ? s + 'T00:00:00Z' : s);
function fmtDate(s, long) { if (!s) return '—'; const d = toD(s); return long ? `${DAYS_L[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_L[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
function fmtDay(s) { if (!s) return '—'; const d = toD(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function fmtTime(iso) { if (!iso) return '—'; const d = toD(iso); return String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0'); }
function fmtDT(iso) { if (!iso) return '—'; return fmtDate(iso.slice(0,10)) + ', ' + fmtTime(iso); }
const hm = min => min == null ? '—' : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2,'0')}m`;
const daysBetween = (a, b) => Math.round((toD(b) - toD(a)) / 86400000);
const addMin = (iso, m) => new Date(toD(iso).getTime() + m * 60000).toISOString().replace('.000','');
const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
const r2 = n => Math.round(n * 100) / 100;
const uniq = a => [...new Set(a)];

/* ---------- store ---------- */
const KEY = 'thp.state.v3', POD_KEY = 'thp.pods.v3', SESSION_KEY = 'thp.session.v3';
const Store = {
  state: null, pods: {}, session: null, persistOk: true,
  load() {
    try { const raw = localStorage.getItem(KEY); this.state = raw ? JSON.parse(raw) : null; } catch (e) { this.state = null; }
    if (!this.state || this.state.version !== 3) { this.state = buildSeed(); this.save(); }
    try { this.pods = JSON.parse(localStorage.getItem(POD_KEY) || '{}'); } catch (e) { this.pods = {}; }
    try { this.session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { this.session = null; }
  },
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); this.persistOk = true; }
    catch (e) { this.persistOk = false; toast('Browser storage is unavailable — changes will last until this tab closes.', 'err'); }
  },
  savePods() { localStorage.setItem(POD_KEY, JSON.stringify(this.pods)); },
  setSession(s) { this.session = s; try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) {} },
  reset() {
    try { localStorage.removeItem(KEY); localStorage.removeItem(POD_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) {}
    this.state = buildSeed(); this.pods = {}; this.session = null; this.save();
  },
};
const S = () => Store.state;
const nowIso = () => S().clock;
function tick(min) { S().clock = addMin(S().clock, min); return S().clock; }
function nextId(prefix) { S().seq += 1; return prefix + '-' + String(S().seq).padStart(3, '0'); }

/* ---------- lookups ---------- */
const byId = (arr, id) => arr.find(x => x.id === id);
const job = id => byId(S().jobs, id);
const vehicle = id => byId(S().vehicles, id);
const driver = id => byId(S().drivers, id);
const customer = id => byId(S().customers, id);
const contact = id => byId(S().contacts, id);
const user = id => byId(S().users, id);
const invoice = id => byId(S().invoices, id);
const driverName = id => { const d = driver(id); return d ? `${d.id} · ${d.name}` : '—'; };

/* ---------- roles & permissions ---------- */
const ROLE_LABEL = { director:'Director', operations:'Operations Manager', transport:'Transport & Compliance', viewonly:'View Only', driver:'Driver', customer:'Customer Portal' };
const SECTIONS = [
  { id:'overview', label:'Dashboard', icon:'home', href:'#/dashboard' },
  { id:'jobs', label:'Jobs & Margins', icon:'jobs', href:'#/jobs' },
  { id:'operations', label:'Operations', icon:'ops', href:'#/ops/today' },
  { id:'cash', label:'Customers & Cash', icon:'cash', href:'#/cash/debtors' },
  { id:'fleet', label:'Fleet & Compliance', icon:'fleet', href:'#/fleet/vehicles' },
  { id:'admin', label:'Administration', icon:'admin', href:'#/admin/team' },
];
const ROLE_SECTIONS = { director:['overview','jobs','operations','cash','fleet','admin'], operations:['overview','jobs','operations'], transport:['overview','operations','fleet'] };
function me() { const s = Store.session; return s && s.userId ? user(s.userId) : null; }
function myRole() { const s = Store.session; if (!s) return null; if (s.kind === 'customer') return 'customer'; const u = me(); return u ? u.role : null; }
function sectionsFor(u) { if (!u) return []; if (u.role === 'viewonly') return ['overview', ...(u.sections || []).filter(x => x !== 'admin' && x !== 'overview')]; return ROLE_SECTIONS[u.role] || []; }
function can(cap) {
  const u = me(); if (!u) return false; const r = u.role;
  switch (cap) {
    case 'money': return r === 'director' || r === 'operations' || (r === 'viewonly' && !!u.money);
    case 'cash': return r === 'director' || (r === 'viewonly' && !!u.money && (u.sections || []).includes('cash'));
    case 'admin': return r === 'director';
    case 'act': return ['director','operations','transport'].includes(r);
    case 'recharge': return r === 'director' || r === 'operations';
    case 'cover': return ['director','operations','transport'].includes(r);
    case 'compliance': return r === 'director' || r === 'transport';
    case 'share': return r === 'director' || r === 'operations';
    case 'pod': return ['director','operations','transport'].includes(r);
    default: return sectionsFor(u).includes(cap);
  }
}
const hasSection = id => sectionsFor(me()).includes(id);

/* ---------- selectors (all aggregates derive from source records) ---------- */
const threshold = () => S().settings.varianceThresholdPct;
const isDone = j => j.status === 'delivered';
const costVar = j => j.actualCost == null ? null : r2(j.actualCost - j.plannedCost);
const costVarPct = j => j.actualCost == null ? null : (j.actualCost - j.plannedCost) / j.plannedCost * 100;
const isFlagged = j => isDone(j) && j.actualCost != null && costVarPct(j) > threshold();
const plannedContrib = j => j.price - j.plannedCost;
const actualContrib = j => j.actualCost == null ? null : j.price - j.actualCost;

function periodStats(list) {
  const done = list.filter(j => isDone(j) && j.actualCost != null);
  const revenue = sum(done, j => j.price), planned = sum(done, j => j.plannedCost), actual = sum(done, j => j.actualCost);
  return { jobs: done.length, revenue, planned, actual, overrun: actual - planned,
    pContrib: revenue - planned, aContrib: revenue - actual,
    pMargin: revenue ? (revenue - planned) / revenue * 100 : null, aMargin: revenue ? (revenue - actual) / revenue * 100 : null,
    late: done.filter(j => j.late), onTime: done.filter(j => !j.late), flagged: done.filter(isFlagged),
    costPending: list.filter(j => isDone(j) && j.actualCost == null) };
}
const yesterdayStats = () => periodStats(S().jobs.filter(j => j.date === YESTERDAY));
function wtdStats() {
  const list = S().jobs.filter(j => j.date >= WEEK_START && j.date <= YESTERDAY && isDone(j));
  return { planned: sum(list, j => j.plannedCost), actual: sum(list, j => j.actualCost), jobs: list.length,
    byDay: uniq(list.map(j => j.date)).sort().map(d => { const l = list.filter(j => j.date === d); return { date:d, planned:sum(l, j => j.plannedCost), actual:sum(l, j => j.actualCost) }; }) };
}
function podStats() {
  const done = S().jobs.filter(isDone);
  const missing = done.filter(j => j.pod.status === 'missing');
  const uninvoiced = done.filter(j => j.invoice.status === 'pending');
  return { missing, uninvoiced, blocked: uninvoiced.filter(j => j.pod.status !== 'received'), ready: uninvoiced.filter(j => j.pod.status === 'received') };
}
function vehicleAvailable(v, date) {
  if (!v) return false;
  if (v.vorSince && date >= v.vorSince && (!v.vorUntil || date < v.vorUntil)) return false;
  return true;
}
function coverState(j) {
  if (j.subcontract) return 'subcontract';
  const v = vehicle(j.vehicleId);
  if (!vehicleAvailable(v, j.date)) return 'vehicle_unavailable';
  if (j.driverId) return 'confirmed';
  if (j.proposedDriverId) return 'proposed';
  return 'no_driver';
}
function todayStats() {
  const list = S().jobs.filter(j => j.date === TODAY);
  const st = list.map(j => ({ j, c: coverState(j) }));
  const confirmed = st.filter(x => x.c === 'confirmed' || x.c === 'subcontract').length;
  const proposed = st.filter(x => x.c === 'proposed').map(x => x.j);
  const uncovered = st.filter(x => x.c === 'no_driver' || x.c === 'vehicle_unavailable').map(x => x.j);
  return { list, booked: list.length, confirmed, proposed, planned: confirmed + proposed.length, uncovered };
}
function bucketOf(inv) { const a = daysBetween(inv.date, TODAY); return a <= 30 ? 0 : a <= 60 ? 1 : a <= 90 ? 2 : 3; }
const BUCKETS = ['0–30 days', '31–60 days', '61–90 days', '90+ days'];
function debtorStats() {
  const open = S().invoices.filter(i => i.status === 'outstanding');
  const buckets = [0, 1, 2, 3].map(b => sum(open.filter(i => bucketOf(i) === b), i => i.amount));
  const eligibleList = open.filter(i => i.eligible && bucketOf(i) < 3);
  const eligible = sum(eligibleList, i => i.amount);
  const b = S().bibby; const funding = r2(eligible * b.advanceRate);
  const headroom = Math.max(0, Math.min(funding, b.facilityCeiling) - b.drawn);
  return { open, buckets, total: sum(buckets), eligible, funding, headroom, bibby: b };
}
function utilisation(vehicleId) {
  const days = ['2026-11-02', '2026-11-03', '2026-11-04'];
  const vs = vehicleId ? [vehicle(vehicleId)] : S().vehicles;
  let avail = 0, worked = 0, miles = 0, empty = 0;
  vs.forEach(v => days.forEach(d => {
    if (vehicleAvailable(v, d)) avail++;
    const js = S().jobs.filter(j => j.vehicleId === v.id && j.date === d && isDone(j));
    if (js.length) worked++;
    miles += sum(js, j => j.actualMiles || 0); empty += sum(js, j => j.emptyMiles || 0);
  }));
  return { avail, worked, util: avail ? worked / avail * 100 : null, miles, empty, emptyPct: miles ? empty / miles * 100 : null };
}
const activeRecharges = () => S().recharges.filter(r => r.status === 'draft');
const openDefects = vid => S().defects.filter(d => d.vehicleId === vid && d.status !== 'rectified');
function vehicleStatus(v) {
  if (v.status === 'vor') return { label:'Vehicle Off Road', cls:'bad' };
  const safety = openDefects(v.id).filter(d => d.severity === 'safety');
  if (safety.length) return { label:'Safety defect — not cleared', cls:'bad' };
  if (openDefects(v.id).length) return { label:'Minor defect reported', cls:'warn' };
  const tj = S().jobs.find(j => j.vehicleId === v.id && j.date === TODAY && ['en_route','on_site'].includes(j.status));
  if (tj) return { label:'On the road', cls:'info' };
  return { label:'Available', cls:'ok' };
}
const sharesForJob = id => S().shares.filter(s => s.jobId === id && s.active);
const sharesForContact = id => S().shares.filter(s => s.contactId === id && s.active);
function linkState(l) { if (!l) return 'missing'; if (l.usedAt) return 'used'; if (l.expired || nowIso() > l.expiresAt) return 'expired'; return 'valid'; }

/* ---------- activity log ---------- */
function actor() {
  const s = Store.session;
  if (!s) return { id:'SYSTEM', name:'System', role:'System' };
  if (s.kind === 'customer') { const c = contact(s.contactId); return { id:c.id, name:`${c.name} (${customer(c.customerId).name})`, role:'Customer' }; }
  const u = me(); return { id:u.id, name:u.name, role:ROLE_LABEL[u.role] };
}
function log(action, recordType, recordId, prev, next, extra = {}) {
  const a = actor();
  S().activity.unshift(Object.assign({ t: nowIso(), actorId:a.id, actorName:a.name, actorRole:a.role, action, recordType, recordId, prev: prev == null ? '—' : String(prev), next: next == null ? '—' : String(next) }, extra));
}
function actorLabel(e) {
  if (e.actorName) return { name:e.actorName, role:e.actorRole };
  if (e.actorId === 'SYSTEM') return { name:'System (simulated)', role:'System' };
  const u = user(e.actorId); return u ? { name:u.name, role:ROLE_LABEL[u.role] } : { name:e.actorId, role:'' };
}
const stripMoney = s => String(s).replace(/[−+-]?£\s?[\d,]+(\.\d+)?/g, '[amount restricted]');
const safeText = s => can('money') ? s : stripMoney(s);

/* ---------- services (state-changing; each logs activity) ---------- */
const Svc = {
  draftRecharge(jobId, amount, note) {
    const j = job(jobId);
    if (!j || !j.recharge) throw new Error('This job has no identified recharge opportunity.');
    if (activeRecharges().some(r => r.jobId === jobId)) throw new Error('A draft recharge already exists for ' + jobId + '.');
    amount = Number(amount);
    if (!(amount > 0)) throw new Error('Enter a recharge amount greater than zero.');
    if (amount > j.recharge.amount) throw new Error(`Amount cannot exceed the evidenced recharge candidate of ${gbp(j.recharge.amount)}.`);
    tick(2);
    const r = { id: nextId('RCH'), jobId, customerId: j.customerId, amount, note: note || j.recharge.basis, status:'draft', createdBy: me().id, createdAt: nowIso(), history: [] };
    S().recharges.push(r);
    log('Drafted recharge', 'job', jobId, 'No draft', `Draft ${gbp(amount)} (not invoiced)`, { money: true });
    Store.save(); return r;
  },
  editRecharge(id, note) {
    const r = byId(S().recharges, id); tick(1);
    const prev = r.note; r.note = note; r.history.push({ t: nowIso(), by: me().id, change:'Note edited' });
    log('Edited recharge note', 'job', r.jobId, prev.slice(0, 60), note.slice(0, 60)); Store.save();
  },
  cancelRecharge(id) {
    const r = byId(S().recharges, id); tick(1); r.status = 'cancelled'; r.history.push({ t: nowIso(), by: me().id, change:'Cancelled' });
    log('Cancelled recharge draft', 'job', r.jobId, `Draft ${gbp(r.amount)}`, 'Cancelled', { money: true }); Store.save();
  },
  restoreRecharge(id) {
    const r = byId(S().recharges, id);
    if (activeRecharges().some(x => x.jobId === r.jobId)) throw new Error('Another draft already exists for this job.');
    tick(1); r.status = 'draft'; r.history.push({ t: nowIso(), by: me().id, change:'Restored' });
    log('Restored recharge draft', 'job', r.jobId, 'Cancelled', `Draft ${gbp(r.amount)}`, { money: true }); Store.save();
  },
  coverCheck(jobId, driverId) {
    const j = job(jobId), d = driver(driverId);
    if (!d) return { ok:false, msg:'Select a driver.' };
    if (d.todayState !== 'available') return { ok:false, msg:`${d.id} is not available today (${d.todayState === 'allocated' ? 'already allocated' : 'rest day or leave'}).` };
    if (d.hoursAvailMin < j.requiredMin) return { ok:false, msg:`${d.id} has an estimated ${hm(d.hoursAvailMin)} available. This job needs an illustrative ${hm(j.requiredMin)}, so ${d.id} is not planning-eligible.` };
    return { ok:true };
  },
  proposeCover(jobId, driverId) {
    const chk = this.coverCheck(jobId, driverId); if (!chk.ok) throw new Error(chk.msg);
    const j = job(jobId); tick(3);
    j.proposedDriverId = driverId; j.proposedBy = me().id; j.proposedAt = nowIso();
    driver(driverId).todayState = 'proposed';
    log('Proposed driver cover', 'job', jobId, 'No driver', `${driverId} proposed — awaiting Vigo confirmation`);
    Store.save();
  },
  withdrawCover(jobId) {
    const j = job(jobId); const d = j.proposedDriverId; tick(1);
    driver(d).todayState = 'available'; j.proposedDriverId = null;
    log('Withdrew proposed cover', 'job', jobId, `${d} proposed`, 'No driver'); Store.save();
  },
  raiseAction(a) {
    if (!a.title || !a.title.trim()) throw new Error('Give the action a short title.');
    if (!a.ownerId) throw new Error('Choose an owner.');
    tick(2);
    const x = Object.assign({ id: nextId('ACT'), status:'open', createdBy: me().id, createdAt: nowIso(), progress: [] }, a);
    S().actions.unshift(x);
    log('Raised action', x.recordType || 'action', x.recordId || x.id, '—', `${x.title} · owner ${user(x.ownerId).name} · ${x.priority}`);
    Store.save(); return x;
  },
  addProgress(id, note) {
    if (!note.trim()) throw new Error('Write a short progress note.');
    const a = byId(S().actions, id); tick(1);
    a.progress.push({ t: nowIso(), by: me().id, note });
    log('Recorded action progress', a.recordType || 'action', a.recordId || a.id, a.title, note.slice(0, 80)); Store.save();
  },
  completeAction(id, note) {
    const a = byId(S().actions, id); tick(1);
    a.status = 'done'; a.completedAt = nowIso(); a.completedBy = me().id;
    if (note) a.progress.push({ t: nowIso(), by: me().id, note });
    log('Completed action', a.recordType || 'action', a.recordId || a.id, 'Open', 'Completed — ' + a.title); Store.save();
  },
  reopenAction(id) { const a = byId(S().actions, id); tick(1); a.status = 'open'; log('Reopened action', a.recordType || 'action', a.recordId || a.id, 'Completed', 'Open'); Store.save(); },
  recordFollowUp(cmpId, f) {
    if (!f.note || !f.note.trim()) throw new Error('Describe the follow-up that took place.');
    const c = byId(S().compliance, cmpId); tick(4);
    const prev = c.status;
    c.history.push({ t: nowIso(), by: me().id, note: f.note, method: f.method, next: f.nextDate });
    c.status = 'followup'; c.followUpAt = nowIso(); c.followUpBy = me().id; c.nextReview = f.nextDate || null;
    if (c.driverId) { const d = driver(c.driverId); if (c.kind === 'licence') d.licenceStatus = 'followup'; if (c.kind === 'tacho') d.tachoStatus = 'followup'; }
    log('Recorded compliance follow-up', c.driverId ? 'driver' : 'vehicle', c.driverId || c.vehicleId, statusLabel(prev), 'Follow-up recorded (internal record)');
    Store.save();
  },
  submitWalkaround(jobId, vehicleId, results) {
    tick(6);
    const w = { id: nextId('WLK'), jobId, vehicleId, driverId: me().driverId, at: nowIso(), results, defects: [] };
    results.filter(r => r.result === 'defect').forEach(r => {
      const d = { id: nextId('DEF'), vehicleId, item: r.item, severity: r.severity, note: r.note || '', reportedBy: me().driverId, reportedAt: nowIso(), status:'open', source:'Driver app walkaround', history: [] };
      S().defects.unshift(d); w.defects.push(d.id);
      log('Reported vehicle defect', 'vehicle', vehicleId, 'No open defect', `${d.severity === 'safety' ? 'Safety-critical' : 'Minor'}: ${d.item}`);
    });
    S().walkarounds.unshift(w);
    const j = job(jobId); j.checkins.push({ stage:'walkaround', at: nowIso(), by: me().driverId, note: w.defects.length ? `${w.defects.length} defect(s) reported` : 'No defects' });
    log('Completed walkaround check', 'vehicle', vehicleId, '—', w.defects.length ? `Completed with ${w.defects.length} defect(s) — not cleared` : 'Completed — no defects');
    Store.save(); return w;
  },
  resolveDefect(defId, note) {
    if (!note.trim()) throw new Error('Record what was done to rectify or assess the defect.');
    const d = byId(S().defects, defId); tick(3);
    const prev = d.status; d.status = 'rectified'; d.history.push({ t: nowIso(), by: me().id, note });
    const v = vehicle(d.vehicleId);
    if (prev === 'vor' && !S().defects.some(x => x.vehicleId === v.id && x.status === 'vor')) { v.status = 'available'; v.vorUntil = TODAY; }
    log('Recorded defect rectification', 'vehicle', d.vehicleId, prev === 'vor' ? 'VOR' : 'Open defect', 'Rectified — ' + note.slice(0, 60)); Store.save();
  },
  checkin(jobId, stage) {
    const j = job(jobId);
    const mins = { depart:10, arrive:75, unloading:8, complete:40 }[stage] || 2;
    tick(mins);
    const prev = j.status;
    j.checkins.push({ stage, at: nowIso(), by: me().driverId });
    if (stage === 'depart') { j.status = 'en_route'; j.eta = addMin(nowIso(), 75); }
    if (stage === 'arrive') j.status = 'on_site';
    if (stage === 'complete') {
      j.status = 'delivered'; j.deliveredAt = fmtTime(nowIso()); j.late = fmtTime(nowIso()) > j.slot;
      j.pod = { status:'missing' }; j.invoice = { status:'pending' };
      j.actualCost = null; j.costPending = true;
    }
    log('Driver check-in: ' + STAGE_LABEL[stage], 'job', jobId, statusLabel(prev), statusLabel(j.status));
    if (stage === 'complete') this.notifyDelivery(j);
    Store.save();
  },
  notifyDelivery(j) {
    sharesForJob(j.id).forEach(sh => {
      const c = contact(sh.contactId);
      if (!c.notify) { log('Delivery notification suppressed', 'job', j.id, '—', `${c.email} has opted out (simulated)`); return; }
      this.issueLink(c.id, j.id, 'delivery');
    });
  },
  issueLink(contactId, jobId, kind) {
    const token = 'otl-' + Math.abs(hash(contactId + jobId + nowIso() + S().seq)).toString(16).slice(0, 6);
    S().seq++;
    const l = { token, contactId, jobId, issuedAt: nowIso(), expiresAt: addMin(nowIso(), S().settings.linkHours * 60), usedAt: null, expired: false };
    S().links.unshift(l);
    const j = job(jobId);
    S().emails.unshift({ id: nextId('EM'), to: contactId, jobId, token, at: nowIso(), kind, subject: kind === 'delivery' ? `Delivered: ${jobId} to ${j.dest}` : `Your sign-in link for ${jobId}` });
    log('Delivery notification simulated', 'job', jobId, '—', `Email preview + one-time link for ${contact(contactId).email} (not sent)`);
    return l;
  },
  openLink(token) {
    const l = S().links.find(x => x.token === token);
    const st = linkState(l);
    if (st !== 'valid') return st;
    tick(1); l.usedAt = nowIso();
    Store.setSession({ kind:'customer', contactId: l.contactId, via:'link', jobId: l.jobId });
    log('Signed in with one-time link', 'job', l.jobId, 'Link valid', 'Link used (single use)');
    Store.save(); return 'ok';
  },
  expireLink(token) { const l = S().links.find(x => x.token === token); l.expired = true; log('Simulated link expiry', 'job', l.jobId, 'Valid', `Expired (${S().settings.linkHours}h demo period elapsed)`); Store.save(); },
  setNotify(contactId, on) { const c = contact(contactId); tick(1); c.notify = on; log(on ? 'Opted in to delivery notifications' : 'Opted out of delivery notifications', 'contact', contactId, on ? 'Opted out' : 'Opted in', on ? 'Opted in' : 'Opted out'); Store.save(); },
  share(jobId, contactId, opts) {
    if (sharesForJob(jobId).some(s => s.contactId === contactId)) throw new Error('Already shared with this contact.');
    tick(2);
    const s = { id: nextId('SH'), jobId, contactId, pod: !!opts.pod, invoice: !!opts.invoice, by: me().id, at: nowIso(), active: true };
    S().shares.push(s);
    log('Shared job with customer', 'job', jobId, 'Not shared', `Shared with ${contact(contactId).name} (${customer(contact(contactId).customerId).name})`);
    Store.save(); return s;
  },
  updateShare(id, key, val) { const s = byId(S().shares, id); tick(1); s[key] = val; log('Updated customer sharing', 'job', s.jobId, `${key === 'pod' ? 'POD' : 'Invoice'} ${val ? 'hidden' : 'visible'}`, `${key === 'pod' ? 'POD' : 'Invoice'} ${val ? 'visible' : 'hidden'}`); Store.save(); },
  unshare(id) { const s = byId(S().shares, id); tick(1); s.active = false; log('Stopped sharing job', 'job', s.jobId, `Shared with ${contact(s.contactId).name}`, 'Not shared'); Store.save(); },
  podUpload(jobId, file) {
    const j = job(jobId);
    if (file && file.dataUrl) {
      try { Store.pods[jobId] = file; Store.savePods(); }
      catch (e) { delete Store.pods[jobId]; throw new Error('Browser storage is full, so the image could not be saved. Try a smaller photo (under 1.5 MB), or reset the demo to clear earlier uploads.'); }
    }
    tick(Store.session.kind === 'staff' && me().role === 'driver' ? 3 : 2);
    const prev = j.pod.status;
    j.pod = { status:'received', at: nowIso(), by: actor().id, hasImage: !!(file && file.dataUrl), name: file ? file.name : 'Paper POD logged', source:'Uploaded in portal (demo — not sent to Vigo or SharePoint)' };
    if (j.date === TODAY) j.checkins.push({ stage:'pod', at: nowIso(), by: actor().id });
    log('POD uploaded', 'job', jobId, prev === 'missing' ? 'POD missing' : prev, j.invoice.status === 'pending' ? 'POD received — ready to invoice' : 'POD received');
    Store.save();
  },
  invite(f) {
    if (!f.name.trim()) throw new Error('Enter the person’s name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) throw new Error('Enter a valid email address.');
    if (S().users.some(u => u.email.toLowerCase() === f.email.toLowerCase())) throw new Error('Someone with that email is already on the team.');
    if (f.role === 'viewonly' && !f.sections.length) throw new Error('Choose at least one section a View Only user can see.');
    tick(2);
    const u = { id: nextId('U'), name: f.name.trim(), email: f.email.trim(), role: f.role, title: ROLE_LABEL[f.role], status:'invited', sections: f.role === 'viewonly' ? f.sections : undefined, money: f.role === 'viewonly' ? !!f.money : undefined, invitedBy: me().id, invitedAt: nowIso() };
    S().users.push(u);
    log('Invited user', 'user', u.id, '—', `${u.name} as ${ROLE_LABEL[u.role]} (invitation simulated — no email sent)`);
    Store.save(); return u;
  },
  setUserStatus(id, status) {
    const u = user(id); if (u.id === me().id) throw new Error('You cannot suspend your own account.');
    tick(1); const prev = u.status; u.status = status;
    log(status === 'suspended' ? 'Suspended user' : 'Restored user', 'user', id, cap(prev), cap(status)); Store.save();
  },
  setThreshold(v) {
    v = Number(v); if (!(v > 0 && v <= 100)) throw new Error('Enter a threshold between 1% and 100%.');
    const prev = threshold(); const before = S().jobs.filter(isFlagged).length; tick(1);
    S().settings.varianceThresholdPct = v; const after = S().jobs.filter(isFlagged).length;
    log('Changed cost-variance threshold', 'setting', 'threshold', `${prev}% (${before} flagged)`, `${v}% (${after} flagged)`); Store.save();
  },
  publishRates(rates, note) {
    const prev = S().rateCards[S().rateCards.length - 1];
    tick(2);
    const n = S().rateCards.length + 1;
    S().rateCards.push({ version: `RC-2026-11-v${n}`, effective: nowIso(), createdBy: me().id, note: note || 'Rate update', rates });
    log('Published rate card version', 'setting', 'rates', prev.version, `RC-2026-11-v${n} (applies to new costings only)`); Store.save();
  },
};
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

/* ---------- status vocabulary ---------- */
const STAGE_LABEL = { walkaround:'Walkaround check', depart:'Departed depot', arrive:'Arrived at customer', unloading:'Unloading started', complete:'Delivery complete', pod:'POD uploaded' };
function statusLabel(s) {
  return { not_started:'Not started', en_route:'En route', on_site:'On site', delivered:'Completed', overdue:'Overdue', unsigned:'Unsigned', followup:'Follow-up recorded', upcoming:'Upcoming', open:'Open', vor:'VOR', rectified:'Rectified' }[s] || s;
}
function deliveryPill(j) {
  if (j.status === 'delivered') return j.late ? `<span class="pill warn">Late · ${esc(j.deliveredAt)}</span>` : `<span class="pill ok">On time</span>`;
  if (j.status === 'en_route') return `<span class="pill info">En route</span>`;
  if (j.status === 'on_site') return `<span class="pill info">On site</span>`;
  return `<span class="pill">Booked · ${esc(j.slot)}</span>`;
}
function coverPill(j) {
  const c = coverState(j);
  return { confirmed:'<span class="pill ok">Covered</span>', subcontract:'<span class="pill ok">Subcontracted</span>', proposed:'<span class="pill warn">Proposed — awaiting Vigo</span>', no_driver:'<span class="pill bad">No driver</span>', vehicle_unavailable:'<span class="pill bad">Vehicle unavailable</span>' }[c];
}
function podPill(j) {
  if (j.pod.status === 'received') return '<span class="pill ok">POD received</span>';
  if (j.pod.status === 'missing') return '<span class="pill bad">POD missing</span>';
  return '<span class="pill plain">Not yet due</span>';
}
function invPill(j) {
  const s = j.invoice.status;
  if (s === 'invoiced') return '<span class="pill ok">Invoiced</span>';
  if (s === 'pending') return j.pod.status === 'received' ? '<span class="pill info">Ready to invoice</span>' : '<span class="pill warn">Blocked — POD</span>';
  if (s === 'unmodelled') return '<span class="pill plain" title="Invoice records for synthetic history are not modelled in this demo">Not modelled</span>';
  return '<span class="pill plain">Not yet due</span>';
}

/* ---------- icons ---------- */
const ICONS = {
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  jobs:'<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
  ops:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>',
  cash:'<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M6 10v5M18 10v5"/>',
  fleet:'<path d="M1 16V6h13v10M14 9h4l4 4v3h-8"/><circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/>',
  admin:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 15.4H3a2 2 0 110-4h.1A1.6 1.6 0 004.6 9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0010 5.1V5a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V11a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  chevR:'<path d="M9 6l6 6-6 6"/>', chevL:'<path d="M15 6l-6 6 6 6"/>', back:'<path d="M19 12H5M12 19l-7-7 7-7"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', download:'<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  print:'<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z"/>', check:'<path d="M5 12l5 5L20 7"/>',
  alert:'<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17.5v.5"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>', plus:'<path d="M12 5v14M5 12h14"/>', map:'<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>', file:'<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
  lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>', mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', logout:'<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  refresh:'<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>', menu:'<path d="M3 6h18M3 12h18M3 18h18"/>', link:'<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  camera:'<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>', truck:'<path d="M1 16V6h13v10M14 9h4l4 4v3h-8"/><circle cx="6" cy="17" r="2"/><circle cx="18" cy="17" r="2"/>',
};
const icon = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------- toast & modal ---------- */
function toast(msg, kind) {
  let box = document.querySelector('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast' + (kind === 'err' ? ' err' : '');
  t.innerHTML = icon(kind === 'err' ? 'alert' : 'check') + '<div>' + esc(msg) + '</div>';
  box.appendChild(t); setTimeout(() => t.remove(), 4200);
}
const Modal = {
  el: null, onSubmit: null, lastFocus: null,
  open({ title, sub, body, foot, wide, onSubmit, onOpen }) {
    this.close();
    this.lastFocus = document.activeElement;
    const back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="m-title" novalidate>
      <div class="modal-head"><div><h2 id="m-title">${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-act="modalClose" aria-label="Close">${icon('x')}</button></div>
      <div class="modal-body">${body}</div>${foot != null ? `<div class="modal-foot">${foot}</div>` : ''}</form>`;
    document.body.appendChild(back); this.el = back; this.onSubmit = onSubmit;
    back.addEventListener('mousedown', e => { if (e.target === back) this.close(); });
    back.querySelector('form').addEventListener('submit', e => { e.preventDefault(); if (this.onSubmit) { try { this.onSubmit(new FormData(e.target), e.target); } catch (err) { this.error(err.message); } } });
    const f = back.querySelector('input:not([type=hidden]):not([disabled]),textarea,select,button.btn-primary'); if (f) setTimeout(() => f.focus(), 30);
    if (onOpen) onOpen(back);
  },
  error(msg) { const box = this.el && this.el.querySelector('.m-err'); if (box) { box.textContent = msg; box.hidden = false; } else toast(msg, 'err'); },
  close() { if (this.el) { this.el.remove(); this.el = null; if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus(); } },
};
const errBox = '<div class="field"><div class="err m-err" role="alert" hidden></div></div>';

/* ---------- table builder ---------- */
function table({ cols, rows, rowAttr, foot, sort, sortKey, cards = true, empty }) {
  if (!rows.length) return empty || `<div class="empty"><h4>No matching records</h4><p>Try widening the date range or clearing a filter.</p></div>`;
  const th = cols.map(c => {
    const sortable = c.sort && sortKey;
    const arrow = sortable && sort && sort.key === c.key ? (sort.dir === 'asc' ? '↑' : '↓') : '';
    return `<th class="${c.num ? 'num' : ''} ${sortable ? 'sortable' : ''}" ${sortable ? `data-act="sort" data-table="${sortKey}" data-key="${c.key}" tabindex="0" aria-sort="${arrow ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${esc(c.label)}${arrow ? `<span class="arr">${arrow}</span>` : ''}</th>`;
  }).join('');
  const body = rows.map(r => `<tr ${rowAttr ? rowAttr(r) : ''}>${cols.map((c, i) => `<td class="${c.num ? 'num' : ''} ${i === 0 ? 'cell-main' : ''} ${c.cls || ''}" data-label="${esc(c.label)}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('');
  const tf = foot ? `<tfoot><tr>${cols.map((c, i) => `<td class="${c.num ? 'num' : ''} ${i === 0 ? 'cell-main' : ''}" data-label="${esc(c.label)}">${foot[c.key] != null ? foot[c.key] : ''}</td>`).join('')}</tr></tfoot>` : '';
  return `<div class="table-wrap ${cards ? 'cards-wrap-m' : ''}"><table class="data ${cards ? 'cards' : ''}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody>${tf}</table></div>`;
}
function sortRows(rows, sort, getters) {
  if (!sort || !sort.key) return rows;
  const g = getters[sort.key] || (r => r[sort.key]);
  const d = sort.dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => { const x = g(a), y = g(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * d; });
}

/* ---------- CSV & print ---------- */
function downloadCSV(name, header, rows) {
  const q = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = [header.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  log('Exported CSV', 'export', name, '—', `${rows.length} rows (${can('money') ? 'with' : 'without'} financial columns)`); Store.save();
  toast(`Exported ${rows.length} rows to ${name}`);
}
function printHTML(html) {
  let root = document.getElementById('print-root');
  root.innerHTML = html;
  log('Printed report', 'export', 'report', '—', `Role-filtered report for ${ROLE_LABEL[myRole()]}`); Store.save();
  setTimeout(() => window.print(), 50);
}
