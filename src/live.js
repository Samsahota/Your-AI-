/* ==========================================================================
   LIVE MODE — connects the approved interface to Supabase.
   Included only in the production build (platform/scripts/build-web.mjs).
   Replaces the in-browser store with database reads (row-level security decides
   what each person receives) and replaces every action with a database workflow
   function. The screens themselves are shared with the offline demo.
   ========================================================================== */
const CFG = window.THP_CONFIG;
const sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
document.body.classList.add('live');
let PROFILE = null, TENANT = null, LIVE_READY = false;

/* ---------- labels & dates ---------- */
disclosure = () => TENANT && TENANT.settings.business_date_override
  ? { short: 'Demo company', long: ` · fixed business date ${fmtDay(TENANT.settings.business_date_override)}`, title: 'This is the demonstration company. Its business date is fixed so the demo story stays consistent.' }
  : { short: TENANT ? TENANT.name : 'Haulage Portal', long: ' · read-only connections to your systems', title: 'Source systems stay the system of record. The portal reads them on a schedule.' };
clockLabel = () => `${fmtDate(TODAY)} · ${fmtTime(new Date().toISOString())} UK time`;
positionLabel = () => `updated ${fmtTime(S().clock)}`;
tenantName = () => (TENANT ? TENANT.name.replace(/\s*\(demo\)$/i, '') : 'Haulage Portal');
function setBusinessDates() {
  const today = TENANT.settings.business_date_override || UK_DATE.format(new Date());
  TODAY = today;
  const dow = toD(today).getUTCDay();
  YESTERDAY = addDays(today, dow === 1 ? -3 : dow === 0 ? -2 : -1);   // previous working day
  WEEK_START = mondayOf(today) <= YESTERDAY ? mondayOf(today) : mondayOf(YESTERDAY);
}

/* ---------- data access ---------- */
async function fetchAll(table, select = '*', apply = q => q) {
  const out = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await apply(sb.from(table).select(select)).range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data); if (data.length < size) break;
  }
  return out;
}
async function rpc(name, args) { const { data, error } = await sb.rpc(name, args); if (error) throw new Error(error.message); return data; }
const camel = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/_([a-z])/g, (m, c) => c.toUpperCase()), v]));
const hist = h => (h || []).map(x => ({ t: x.t, by: x.by, note: x.note, method: x.method, next: x.next, change: x.change }));
const n = v => v == null ? null : Number(v);

async function loadState() {
  const role = PROFILE.role, staff = ['director', 'operations', 'transport', 'viewonly'].includes(role);
  const since = addDays(TODAY, -CFG.historyDays);
  const st = { version: 'live', clock: new Date().toISOString(), seq: 0, links: [], walkarounds: [], recharges: [], emails: [], paid: [], invoices: [], activity: [],
    settings: { varianceThresholdPct: n(TENANT.settings.variance_threshold_pct), revenueTarget: n(TENANT.settings.revenue_target_daily), linkHours: n(TENANT.settings.link_hours) },
    trailers: (TENANT.fleet_summary && TENANT.fleet_summary.trailers) || { total: 0, curtainsider: 0, flatbed: 0, fridge: 0 } };
  if (role === 'customer') return loadCustomer(st);
  const jobFilter = q => q.gte('date', since);
  const [profiles, customers, contacts, vehicles, drivers, days, jobs, fins, vars, cands, checkins] = await Promise.all([
    fetchAll('profiles'), fetchAll('customers'), fetchAll('contacts'), fetchAll('vehicles'), fetchAll('drivers'),
    staff ? fetchAll('driver_days', '*', q => q.eq('date', TODAY)) : [], fetchAll('jobs', '*', jobFilter),
    fetchAll('job_financials'), fetchAll('job_variances'), fetchAll('recharge_candidates'), fetchAll('job_checkins', '*', q => q.gte('at', addDays(TODAY, -14) + 'T00:00:00Z').order('at')),
  ]);
  const [compliance, defects, walks, actions, recharges, shares, notes, documents, connections, rates, invoices, payments, funding, feed] = await Promise.all([
    staff ? fetchAll('compliance_items') : [], fetchAll('defects'), fetchAll('walkarounds', '*', q => q.gte('at', addDays(TODAY, -14) + 'T00:00:00Z')),
    staff ? fetchAll('actions') : [], fetchAll('recharges'), staff ? fetchAll('shares') : [], staff ? fetchAll('notifications', '*', q => q.order('created_at', { ascending: false }).limit(200)) : [],
    staff ? fetchAll('documents') : [], staff ? fetchAll('connections') : [], fetchAll('rate_cards', '*', q => q.order('effective')),
    fetchAll('invoices', '*', q => q.eq('status', 'outstanding')), fetchAll('payments'), fetchAll('funding_positions', '*', q => q.order('as_at', { ascending: false }).limit(1)),
    staff ? fetchAll('activity_feed', '*', q => q.order('at', { ascending: false }).limit(300)) : [],
  ]);
  const fin = new Map(fins.map(f => [f.job_id, f]));
  const dd = new Map(days.map(d => [d.driver_id, d]));
  st.users = profiles.filter(p => p.role !== 'customer').map(p => ({ id: p.user_id, name: p.name, email: p.email, role: p.role, title: p.title, status: p.status, sections: p.sections, money: p.can_view_money, driverId: p.driver_id, demo: false }));
  st.customers = customers.map(c => ({ id: c.id, name: c.name, type: c.type, terms: c.terms_days, accountRef: c.account_ref }));
  st.contacts = contacts.map(c => ({ id: c.id, customerId: c.customer_id, name: c.name, title: c.title, email: c.email, notify: c.notify }));
  st.vehicles = vehicles.map(v => ({ id: v.id, type: v.type, typeKey: v.type_key, depot: v.depot, status: v.status, vorSince: v.vor_since, vorUntil: v.vor_until, vorReason: v.vor_reason, motDue: v.mot_due }));
  st.drivers = drivers.map(d => { const x = dd.get(d.id); return { id: d.id, name: d.name, engagement: d.engagement, agency: d.agency, rate: d.engagement === 'Agency' ? 28 : d.engagement === 'Limited company' ? 23 : 19,
    status: d.status, licenceReviewDue: d.licence_review_due, licenceStatus: d.licence_status, tachoStatus: d.tacho_status, cpcDue: d.cpc_due, todayState: x ? x.state : null, hoursAvailMin: x ? x.hours_avail_min : null }; });
  const varBy = groupBy(vars, 'job_id'), candBy = new Map(cands.map(c => [c.job_id, c])), chkBy = groupBy(checkins, 'job_id');
  st.jobs = jobs.map(j => mapJob(j, fin.get(j.id), varBy[j.id], candBy.get(j.id), chkBy[j.id])).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  st.compliance = compliance.map(c => ({ id: c.id, kind: c.kind, driverId: c.driver_id, vehicleId: c.vehicle_id, title: c.title, detail: c.detail, due: c.due, status: c.status, source: c.source, followUpAt: c.follow_up_at, followUpBy: c.follow_up_by, nextReview: c.next_review, history: hist(c.history) }));
  st.defects = defects.map(d => ({ id: d.id, vehicleId: d.vehicle_id, item: d.item, severity: d.severity, note: d.note, reportedBy: d.reported_by, reportedAt: d.reported_at, status: d.status, source: d.source, history: hist(d.history) })).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
  st.walkarounds = walks.map(w => ({ id: w.id, jobId: w.job_id, vehicleId: w.vehicle_id, driverId: w.driver_id, at: w.at, results: w.results, defects: w.defect_ids })).sort((a, b) => b.at.localeCompare(a.at));
  st.actions = actions.map(a => ({ id: a.id, title: a.title, recordType: a.record_type, recordId: a.record_id, ownerId: a.owner_id, priority: a.priority, due: a.due, status: a.status, notes: a.notes, createdBy: a.created_by, createdAt: a.created_at, completedAt: a.completed_at, completedBy: a.completed_by, progress: hist(a.progress) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  st.recharges = recharges.map(r => ({ id: r.id, jobId: r.job_id, customerId: r.customer_id, amount: n(r.amount), note: r.note, status: r.status, createdBy: r.created_by, createdAt: r.created_at, history: r.history }));
  st.shares = shares.map(s => ({ id: s.id, jobId: s.job_id, contactId: s.contact_id, pod: s.show_pod, invoice: s.show_invoice, by: s.shared_by, at: s.shared_at, active: s.active }));
  st.emails = notes.map(x => ({ id: 'N' + x.id, to: x.contact_id, jobId: x.job_id, at: x.created_at, subject: x.subject, kind: x.kind, status: x.status, error: x.error }));
  st.documents = documents.map(d => ({ id: d.id, title: d.title, category: d.category, updated: d.updated, summary: d.summary, related: d.related || [], source: d.source, owner: d.owner, sourceUrl: d.source_url }));
  st.connections = connections.map(c => ({ id: c.id, name: c.name, purpose: c.purpose, state: c.state, method: c.method, owner: c.owner, data: c.data, lastRunAt: c.last_run_at, lastRunStatus: c.last_run_status }));
  st.rateCards = rates.length ? rates.map(r => ({ version: r.version, effective: r.effective, createdBy: r.created_by, note: r.note, rates: r.rates })) : [{ version: '—', effective: st.clock, createdBy: null, note: 'No rate card visible', rates: {} }];
  st.invoices = invoices.map(i => ({ id: i.id, customerId: i.customer_id, date: i.date, amount: n(i.amount), status: i.status, eligible: i.eligible, ineligibleReason: i.ineligible_reason, jobIds: i.job_ids, synthetic: i.synthetic }));
  st.paid = payments.map(p => ({ id: p.id, customerId: p.customer_id, invoiceDate: p.invoice_date, paidDate: p.paid_date, amount: n(p.amount), synthetic: p.synthetic }));
  const f = funding[0];
  st.bibby = f ? { advanceRate: n(f.advance_rate), facilityCeiling: n(f.facility_ceiling), drawn: n(f.drawn), rule: f.rule, asAt: f.as_at } : { advanceRate: 0, facilityCeiling: 0, drawn: 0, rule: 'No funding statement imported yet.' };
  st.activity = feed.map(e => ({ t: e.at, actorId: e.actor_id, actorName: e.actor_name, actorRole: e.actor_role, action: e.action, recordType: e.record_type, recordId: e.record_id, prev: e.prev, next: e.next }));
  if (role === 'director') st.integrationRuns = await fetchAll('integration_runs', '*', q => q.order('started_at', { ascending: false }).limit(10));
  await signPods(st.jobs.filter(j => j.pod.path).map(j => [j.id, j.pod.path]));
  return st;
}
function groupBy(rows, k) { const o = {}; rows.forEach(r => (o[r[k]] = o[r[k]] || []).push(r)); return o; }
function mapJob(j, f, vs, cand, chk) {
  return { id: j.id, date: j.date, dest: j.dest, customerId: j.customer_id, customerRef: j.customer_ref, vehicleId: j.vehicle_id, driverId: j.driver_id, plannedDriverId: j.planned_driver_id,
    proposedDriverId: j.proposed_driver_id, proposedBy: j.proposed_by, proposedAt: j.proposed_at, slot: j.slot, status: j.status, deliveredAt: j.delivered_at, late: j.late, eta: j.eta,
    miles: n(j.miles), actualMiles: n(j.actual_miles), emptyMiles: n(j.empty_miles), hours: n(j.hours), pallets: j.pallets, address: j.address, addressNote: j.address_note, instructions: j.instructions, note: j.note,
    subcontract: j.subcontract, subcontractor: j.subcontractor, requiredMin: j.required_min, src: j.src,
    price: f ? n(f.price) : undefined, plannedCost: f ? n(f.planned_cost) : undefined, actualCost: f ? n(f.actual_cost) : (j.status === 'delivered' ? undefined : null), overhead: f ? n(f.overhead) : undefined,
    variance: (vs || []).sort((a, b) => a.seq - b.seq).map(v => ({ reason: v.reason, cat: v.cat, amount: n(v.amount) })),
    recharge: cand ? { amount: n(cand.amount), basis: cand.basis } : null,
    pod: { status: j.pod_status, at: j.pod_at, by: j.pod_by, path: j.pod_path, name: j.pod_name, source: j.pod_source, hasImage: !!j.pod_path },
    invoice: { status: j.invoice_status, invoiceId: j.invoice_id },
    checkins: (chk || []).map(c => ({ stage: c.stage, at: c.at, by: c.by_label, note: c.note })) };
}
async function signPods(pairs) {
  Store.pods = {};
  if (!pairs.length) return;
  const { data } = await sb.storage.from('pods').createSignedUrls(pairs.map(p => p[1]), 3600);
  (data || []).forEach((d, i) => { if (d.signedUrl) Store.pods[pairs[i][0]] = { dataUrl: d.signedUrl, name: pairs[i][1].split('/').pop() }; });
}
async function loadCustomer(st) {
  const [rows, contacts, customers] = await Promise.all([fetchAll('portal_deliveries'), fetchAll('contacts'), fetchAll('customers')]);
  const me = contacts[0];
  st.contacts = contacts.map(c => ({ id: c.id, customerId: c.customer_id, name: c.name, title: c.title, email: c.email, notify: c.notify }));
  st.customers = customers.map(c => ({ id: c.id, name: c.name }));
  st.users = []; st.vehicles = []; st.drivers = []; st.compliance = []; st.defects = []; st.actions = []; st.documents = []; st.connections = []; st.rateCards = []; st.bibby = {};
  st.shares = rows.map(r => ({ id: r.share_id, jobId: r.job_id, contactId: me.id, pod: r.show_pod, invoice: r.show_invoice, active: true }));
  st.invoices = rows.filter(r => r.invoice_id).map(r => ({ id: r.invoice_id, date: r.invoice_date, amount: n(r.invoice_amount), customerId: me.customer_id }));
  st.jobs = rows.map(r => ({ id: r.job_id, date: r.date, dest: r.dest, customerId: me.customer_id, customerRef: r.customer_ref, slot: r.slot, status: r.status, deliveredAt: r.delivered_at, eta: r.eta,
    price: r.invoice_amount == null ? undefined : n(r.invoice_amount), pod: { status: r.pod_status || 'n/a', at: r.pod_at, path: r.pod_path }, invoice: { status: r.invoice_id ? 'invoiced' : 'pending', invoiceId: r.invoice_id },
    checkins: (r.checkins || []).map(c => ({ stage: c.stage, at: c.at })), variance: [] }));
  await signPods(st.jobs.filter(j => j.pod.path).map(j => [j.id, j.pod.path]));
  return st;
}
async function reload() {
  const { data: t } = await sb.from('tenants').select('*').single();
  if (t) { TENANT = t; setBusinessDates(); }
  Store.state = await loadState();
}

/* ---------- store & session ---------- */
Store.save = () => {}; Store.savePods = () => {};
Store.setSession = s => { Store.session = s; };
Store.reset = () => {};
log = () => {};
tick = () => nowIso();
const _download = downloadCSV;
downloadCSV = (name, header, rows) => { _download(name, header, rows); rpc('log_export', { p_name: name, p_rows: rows.length }).catch(() => {}); };
const _print = printHTML;
printHTML = html => { document.getElementById('print-root').innerHTML = html; setTimeout(() => window.print(), 50); };
signOut = async () => { document.querySelectorAll('.toast').forEach(t => t.remove()); Modal.close(); await sb.auth.signOut(); PROFILE = null; Store.session = null; Store.state = null; location.hash = '#/signin'; renderLive(); };

/* ---------- workflow actions → database functions ---------- */
const after = async (p) => { const r = await p; await reload(); return r; };
Object.assign(Svc, {
  draftRecharge: (jobId, amount, note) => after(rpc('draft_recharge', { p_job: jobId, p_amount: Number(amount), p_note: note })),
  editRecharge: (id, note) => after(rpc('edit_recharge', { p_id: id, p_note: note })),
  cancelRecharge: id => after(rpc('set_recharge_status', { p_id: id, p_status: 'cancelled' })),
  restoreRecharge: id => after(rpc('set_recharge_status', { p_id: id, p_status: 'draft' })),
  proposeCover: (jobId, driverId) => after(rpc('propose_cover', { p_job: jobId, p_driver: driverId })),
  withdrawCover: jobId => after(rpc('withdraw_cover', { p_job: jobId })),
  raiseAction: async a => { const id = await after(rpc('raise_action', { p_title: a.title, p_owner: a.ownerId, p_priority: a.priority, p_due: a.due, p_record_type: a.recordType, p_record_id: a.recordId, p_notes: a.notes })); return { id, ownerId: a.ownerId }; },
  addProgress: (id, note) => after(rpc('update_action', { p_id: id, p_op: 'progress', p_note: note })),
  completeAction: (id, note) => after(rpc('update_action', { p_id: id, p_op: 'complete', p_note: note || null })),
  reopenAction: id => after(rpc('update_action', { p_id: id, p_op: 'reopen', p_note: null })),
  recordFollowUp: (id, f) => after(rpc('record_followup', { p_id: id, p_note: f.note, p_method: f.method, p_next: f.nextDate || null })),
  submitWalkaround: async (jobId, vehicleId, results) => { const r = await after(rpc('submit_walkaround', { p_job: jobId, p_results: results.map(x => ({ item: x.item, result: x.result, severity: x.result === 'defect' ? x.severity : null, note: x.note })) })); return { id: r.id, defects: r.defects }; },
  resolveDefect: (id, note) => after(rpc('resolve_defect', { p_id: id, p_note: note })),
  checkin: (jobId, stage) => after(rpc('driver_checkin', { p_job: jobId, p_stage: stage })),
  podUpload: async (jobId, file) => {
    let path = null;
    if (file && file.dataUrl) {
      const blob = await (await fetch(file.dataUrl)).blob();
      path = `${TENANT.id}/${jobId}/${Date.now()}-${(file.name || 'pod.jpg').replace(/[^\w.-]+/g, '_')}`;
      const { error } = await sb.storage.from('pods').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
      if (error) throw new Error('The photo could not be uploaded: ' + error.message);
    }
    return after(rpc('record_pod', { p_job: jobId, p_path: path, p_name: file ? file.name : null }));
  },
  share: (jobId, contactId, o) => after(rpc('share_job', { p_job: jobId, p_contact: contactId, p_pod: !!o.pod, p_invoice: !!o.invoice })),
  updateShare: (id, key, val) => after(rpc('update_share', { p_id: id, p_key: key, p_val: val })),
  unshare: id => after(rpc('update_share', { p_id: id, p_key: 'active', p_val: false })),
  issueLink: (contactId, jobId) => after(rpc('request_link', { p_job: jobId, p_contact: contactId })),
  setNotify: (contactId, on) => after(rpc('set_notify', { p_on: on })),
  setThreshold: v => after(rpc('set_threshold', { p_pct: Number(v) })),
  publishRates: (rates, note) => after(rpc('publish_rates', { p_rates: rates, p_note: note })),
  setUserStatus: (id, status) => after(rpc('set_user_status', { p_user: id, p_status: status })),
  invite: async f => { const r = await callFn('invite-user', { name: f.name, email: f.email, role: f.role, sections: f.sections, can_view_money: f.money, driver_id: f.driverId }); await reload(); return { name: f.name, role: f.role, id: r.user_id }; },
  openLink: () => 'missing', expireLink: () => {},
});
async function callFn(name, body, query = '') {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${CFG.supabaseUrl}/functions/v1/${name}${query}`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: CFG.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || `Request failed (${r.status})`);
  return out;
}

/* ---------- live-only screens ---------- */
renderSignin = () => `<div class="signin">
  <section class="signin-left"><div>${brandBlock()}<h1>Your haulage systems, brought together — <em>and acted on.</em></h1>
    <p class="lead">One view over your TMS, accounts, invoice finance and compliance records. It highlights what needs attention and helps your team act on it.</p></div>
    <div class="foot">${esc(CFG.companyFooter || 'Haulage Portal')}</div></section>
  <section class="signin-right"><h2>Sign in</h2><p class="text-2 mt8 mb16">Use your work email.</p>
    <form data-form="liveSignin" class="card card-pad-lg" style="max-width:440px">
      <div class="field"><label for="se">Email</label><input class="input" id="se" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="sp">Password</label><input class="input" id="sp" name="password" type="password" autocomplete="current-password"><div class="hint">Leave blank to receive a one-time sign-in link by email.</div></div>
      <div class="field"><div class="err m-err" role="alert" hidden></div></div>
      <button class="btn btn-primary btn-block btn-lg" type="submit">Sign in</button>
    </form>
    <p class="small muted mt16">Drivers and customer contacts can sign in with the link in their email.</p></section></div>`;
renderMailbox = () => `<div class="m-app"><div class="m-body"><div class="m-card"><h3>Not available</h3><p class="text-2 mt8">Emails are sent to recipients directly in the live system.</p><a class="btn m-btn mt16" href="#/signin">Back</a></div></div></div>`;
function renderAccept() {
  return `<div class="m-app"><header class="m-top light">${MARK}<div class="t"><b>Welcome to ${esc(tenantName())}</b><span>${esc(PROFILE ? PROFILE.email : '')}</span></div></header>
    <form class="m-body" data-form="setPassword"><div class="m-card"><h3>Set your password</h3><p class="text-2 mt8">You can also sign in later with an email link.</p>
    <div class="field mt12"><label for="np">New password</label><input class="input" id="np" name="password" type="password" minlength="10" autocomplete="new-password" required><div class="hint">At least 10 characters.</div></div>
    <button class="btn btn-primary m-btn" type="submit">Save and continue</button><a class="btn btn-ghost btn-block mt8" href="#/dashboard">Skip for now</a></div></form></div>`;
}
function renderMessage(title, body) { return `<div class="m-app"><div class="m-body"><div class="m-card"><h3>${esc(title)}</h3><p class="text-2 mt8">${esc(body)}</p><button class="btn m-btn mt16" data-act="signOut">Sign out</button></div></div></div>`; }

const CONN_IMPORT = { vigo: 'jobs', xero: 'invoices', bibby: 'funding', tacho: 'compliance', paragon: 'routes' };
adminConnections = () => {
  const runs = (S().integrationRuns || []);
  return `<div class="callout good mb16"><div><span class="tag">How the portal fits</span><h3 class="mt8">Your systems stay the system of record.</h3><p class="small text-2 mt8">Each connection is authorised by you, read-only and refreshed on a schedule. File imports work for any source while API access is being arranged.</p></div></div>
  <div class="grid g2">${S().connections.map(c => `<div class="card card-pad"><div class="between"><div><h3 style="font-size:16px">${esc(c.name)}</h3><div class="small text-2">${esc(c.purpose || '')}</div></div><span class="pill ${c.state === 'Configured' || c.state === 'Access agreed' ? 'ok' : c.state === 'Error' ? 'bad' : 'plain'}">${esc(c.state)}</span></div>
    <dl class="kv mt12 small"><dt>Method</dt><dd>${esc(c.method || '—')}</dd><dt>Data read</dt><dd>${esc(c.data || '—')}</dd><dt>Last run</dt><dd>${c.lastRunAt ? `${fmtDT(c.lastRunAt)} · ${esc(c.lastRunStatus || '')}` : 'Not run yet'}</dd></dl>
    <div class="row mt12">${CONN_IMPORT[c.id] && can('act') ? `<button class="btn btn-sm" data-act="importFile" data-arg="${CONN_IMPORT[c.id]}">${icon('upload')}Import file</button>` : ''}
    ${c.id === 'xero' && can('admin') ? (c.state === 'Configured' ? `<button class="btn btn-sm" data-act="runSync" data-arg="xero">Sync now</button>` : `<button class="btn btn-sm btn-primary" data-act="connectXero">Connect Xero</button>`) : ''}
    ${c.id === 'vigo' && can('admin') ? `<button class="btn btn-sm" data-act="runSync" data-arg="vigo-dry">Test mapping</button><button class="btn btn-sm" data-act="runSync" data-arg="vigo">Sync now</button>` : ''}</div></div>`).join('')}</div>
  ${runs.length ? `<div class="card mt16"><div class="card-head"><h3>Recent runs</h3></div>${table({ cols: [{ key: 's', label: 'Source', render: r => esc(r.source) }, { key: 't', label: 'Started', render: r => fmtDT(r.started_at) }, { key: 'st', label: 'Status', render: r => `<span class="pill ${r.status === 'ok' ? 'ok' : r.status === 'error' ? 'bad' : 'plain'}">${r.status}</span>` }, { key: 'n', label: 'Rows', num: true, render: r => `${r.rows_upserted ?? 0} / ${r.rows_in ?? 0}` }, { key: 'e', label: 'Detail', render: r => esc(r.error || '') }], rows: runs })}</div>` : ''}`;
};
modalInvite = () => {
  const secs = SECTIONS.filter(s => !['overview', 'admin'].includes(s.id));
  Modal.open({ title: 'Invite user', sub: 'They receive an email invitation to set up their sign-in',
    body: `<div class="form-grid"><div class="field"><label for="in">Full name</label><input class="input" id="in" name="name"></div><div class="field"><label for="ie">Email address</label><input class="input" id="ie" name="email" type="email"></div></div>
      <div class="field"><label for="ir">Role</label><select class="select" id="ir" name="role"><option value="viewonly">View Only — explicit sections</option><option value="operations">Operations</option><option value="transport">Transport & Compliance</option><option value="director">Director</option><option value="driver">Driver (phone app)</option></select></div>
      <div class="field" id="drv-box" hidden><label for="idrv">Driver record</label><select class="select" id="idrv" name="driver">${S().drivers.filter(d => !d.id.startsWith('A')).map(d => `<option value="${d.id}">${d.id} · ${esc(d.name)}</option>`).join('')}</select></div>
      <div id="vo-box"><div class="label small strong text-2">Sections this person can see (Dashboard is always included)</div>${secs.map(s => `<label class="check"><input type="checkbox" name="sec" value="${s.id}"><span>${s.label}</span></label>`).join('')}
      <label class="check"><input type="checkbox" name="money" id="imoney"><span><b>Can view financial figures</b><div class="small muted">Off by default. Required for Customers & Cash.</div></span></label></div>${errBox}`,
    foot: '<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn btn-primary" type="submit">Send invitation</button>',
    onOpen: el => el.addEventListener('change', e => { if (e.target.name === 'role') { el.querySelector('#vo-box').hidden = e.target.value !== 'viewonly'; el.querySelector('#drv-box').hidden = e.target.value !== 'driver'; } if (e.target.value === 'cash' && e.target.checked) el.querySelector('#imoney').checked = true; }),
    onSubmit: async fd => { const u = await Svc.invite({ name: fd.get('name') || '', email: fd.get('email') || '', role: fd.get('role'), sections: fd.getAll('sec'), money: !!fd.get('money'), driverId: fd.get('driver') }); Modal.close(); toast(`Invitation sent to ${u.name}`); rerender(); } });
};
let importText = null;
function modalImport(kind) {
  importText = null;
  const LABEL = { jobs: 'Jobs (Vigo export)', invoices: 'Invoices / aged debtors (Xero export)', funding: 'Funding statement (Bibby)', compliance: 'Compliance items (Tachomaster export)', routes: 'Planned routes (Paragon)' };
  Modal.open({ title: 'Import file', sub: 'Checked first, then imported — existing portal actions are never overwritten', wide: true,
    body: `<div class="field"><label for="ik">What is in the file?</label><select class="select" id="ik" name="kind">${Object.entries(LABEL).map(([k, l]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <label class="dropzone" for="if">${icon('upload')}<div class="strong mt8">Choose a CSV file</div><div class="small muted">Up to 5 MB</div></label><input id="if" type="file" accept=".csv,text/csv" class="sr-only" data-act-change="importPick">
      <div id="imp-res" class="mt12"></div>${errBox}`,
    foot: '<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn btn-primary" type="submit" id="imp-go" disabled>Import</button>',
    onSubmit: async fd => { if (!importText) throw new Error('Choose a file first.'); const r = await callFn('import-file', { kind: fd.get('kind'), csv: importText }); await reload(); Modal.close(); toast(`Imported ${r.imported} rows${r.errors.length ? ` · ${r.errors.length} rejected` : ''}`); rerender(); } });
}
Object.assign(CHANGE, {
  importPick: async el => {
    const f = el.files[0]; if (!f) return; if (f.size > 5e6) return Modal.error('That file is over 5 MB.');
    importText = await f.text();
    const kind = Modal.el.querySelector('#ik').value;
    const box = Modal.el.querySelector('#imp-res'); box.innerHTML = '<p class="muted">Checking…</p>';
    try {
      const r = await callFn('import-file', { kind, csv: importText, dry_run: true });
      box.innerHTML = `<div class="caveat ${r.errors.length ? 'warn' : ''}">${icon('info')}<div><b>${r.valid} of ${r.rows} rows are valid.</b>${r.errors.length ? `<ul style="margin:6px 0 0;padding-left:18px">${r.errors.slice(0, 8).map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ' Ready to import.'}</div></div>`;
      Modal.el.querySelector('#imp-go').disabled = !r.valid;
    } catch (e) { importText = null; box.innerHTML = ''; Modal.error(e.message); }
  },
});
Object.assign(ACT, {
  importFile: el => modalImport(el.dataset.arg),
  connectXero: async () => { const r = await callFn('xero', {}, '?action=connect'); location.href = r.url; },
  runSync: async el => {
    const a = el.dataset.arg;
    if (a === 'xero') { await callFn('xero', {}, '?action=sync'); await reload(); toast('Xero sync complete'); return rerender(); }
    const r = await callFn('vigo-sync', { dry_run: a === 'vigo-dry' });
    if (a === 'vigo-dry') return Modal.open({ title: 'Vigo mapping check', sub: 'Nothing was written', wide: true, body: `<pre class="small" style="white-space:pre-wrap">${esc(JSON.stringify(r, null, 2))}</pre>`, foot: '<button type="button" class="btn btn-primary" data-act="modalClose">Close</button>' });
    await reload(); toast(`Vigo sync: ${r.upserted} jobs updated`); rerender();
  },
});
Object.assign(FORMS, {
  liveSignin: async (form, fd) => {
    const email = String(fd.get('email') || '').trim(), password = String(fd.get('password') || '');
    const err = form.querySelector('.m-err'); err.hidden = true;
    const show = m => { err.textContent = m; err.hidden = false; };
    if (!email) return show('Enter your email.');
    if (!password) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}${location.pathname}?next=dashboard` } });
      if (error) return show(error.message);
      form.innerHTML = `<h3>Check your email</h3><p class="text-2 mt8">If ${esc(email)} has a portal account, a one-time sign-in link is on its way.</p>`; return;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return show('Email or password not recognised.');
    await startSession();
  },
  setPassword: async (form, fd) => { const { error } = await sb.auth.updateUser({ password: fd.get('password') }); if (error) return toast(error.message, 'err'); toast('Password saved'); location.hash = '#/dashboard'; },
});

/* ---------- boot & routing ---------- */
async function startSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { PROFILE = null; Store.session = null; return renderLive(); }
  const { data: p } = await sb.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle();
  if (!p) { document.getElementById('app').innerHTML = renderMessage('No portal account', 'This sign-in is not linked to a portal account. Ask your director for an invitation.'); return; }
  if (p.status === 'suspended') { document.getElementById('app').innerHTML = renderMessage('Account suspended', 'Your access has been suspended. Contact your director.'); return; }
  if (p.status === 'invited') await rpc('accept_invitation', {});
  PROFILE = { ...p, status: 'active' };
  const { data: t, error } = await sb.from('tenants').select('*').single();
  if (error) throw new Error(error.message);
  TENANT = t; setBusinessDates();
  Object.assign(UI.jobs, { from: YESTERDAY, to: YESTERDAY });
  await reload();
  Store.session = p.role === 'customer' ? { kind: 'customer', contactId: p.contact_id, via: 'live' } : { kind: 'staff', userId: p.user_id };
  LIVE_READY = true;
  subscribe();
  const next = new URLSearchParams(location.search).get('next');
  if (next) { history.replaceState(null, '', location.pathname + '#/' + next); }
  renderLive();
}
function renderLive() {
  const first = parseRoute().parts[0];
  if (first === 'accept' && PROFILE) { document.getElementById('app').innerHTML = renderAccept(); return; }
  if (!PROFILE && first !== 'signin') { location.replace('#/signin'); return; }
  if (PROFILE && (first === 'signin' || first === 'mailbox' || first === 'link')) { location.replace(PROFILE.role === 'customer' ? '#/portal' : PROFILE.role === 'driver' ? '#/driver-app' : '#/dashboard'); return; }
  render();
}
let pending = null;
function subscribe() {
  const refresh = () => { clearTimeout(pending); pending = setTimeout(async () => { if (Modal.el || document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return subscribeRetry(); await reload(); rerender(); }, 800); };
  const subscribeRetry = () => { clearTimeout(pending); pending = setTimeout(refresh, 5000); };
  sb.channel('portal').on('postgres_changes', { event: '*', schema: 'public' }, refresh).subscribe();
  setInterval(() => { if (!Modal.el) { S().clock = new Date().toISOString(); refresh(); } }, 120000);
}
onRoute = renderLive;
(function bootLive() {
  bindEvents();
  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') { PROFILE = null; LIVE_READY = false; } });
  startSession().catch(e => { document.getElementById('app').innerHTML = renderMessage('Could not load the portal', e.message); });
})();
