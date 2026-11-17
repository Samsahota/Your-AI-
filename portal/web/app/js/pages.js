// The area pages: Health and Safety, Service, Cost, People, Compliance, Links and Records.
// Each page shows the figures behind its dashboard colour, then the records behind the figures.
import { rpc, select } from './api.js';
import { esc, pill, fmtValue, money, date, dateTime, time, addDays, daysBetween, table, measureRows, dialog, toast, label, QUAD } from './ui.js';
import { ctx, q, level, isManager, loadDashboard } from './app.js';

const head = (title, sub, actions = '') => `<header class="page-head"><div><h1>${esc(title)}</h1><p class="sub">${sub}</p></div><div class="head-actions">${actions}</div></header>`;
const figures = k => `<section class="card"><div class="qhead"><h2>Figures for ${date(ctx.day)}</h2>${pill(ctx.dash.quadrants[k].status)}</div>${measureRows(ctx.dash.measures.filter(m => m.quadrant === k))}</section>`;
const card = (title, body, sub = '') => `<section class="card"><h2>${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${body}</section>`;
const byId = rows => Object.fromEntries(rows.map(r => [r.id, r]));
const KIND = { accident: 'Accident', personal_accident: 'Personal accident', near_miss: 'Near miss' };
const DIV = [['', 'Company-wide'], ['transport', 'Transport'], ['warehouse', 'Warehouse']];

// ---------------------------------------------------------------- comments (on every area page)
async function comments(main, area) {
  const box = document.createElement('section'); box.className = 'card'; main.append(box);
  const draw = async () => {
    const rows = await q('comments', { area: `eq.${area}`, order: 'created_at.desc', limit: 50 });
    box.innerHTML = `<h2>Comments</h2><p class="sub">Notes for the team: why a figure is red, what's being done. Comments also appear in the daily email.</p>
      <form class="comment-form" novalidate><label class="fld" for="c-${area}"><span class="sr">Add a comment</span><textarea id="c-${area}" rows="2" placeholder="Add a comment" maxlength="2000"></textarea></label><button class="btn primary" type="submit">Post</button></form>
      ${rows.length ? `<ul class="comments">${rows.map(c => `<li><b>${esc(ctx.name(c.author, c.author_name, 'Team member'))}</b> <span class="note">${dateTime(c.created_at)}</span><p>${esc(c.body)}</p></li>`).join('')}</ul>` : '<p class="empty">No comments yet.</p>'}`;
    box.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const t = box.querySelector('textarea'); if (!t.value.trim()) return;
      try { await rpc('add_comment', { p_area: area, p_target: null, p_body: t.value }); toast('Comment posted'); draw(); } catch (x) { toast(x.message, 'error'); }
    };
  };
  await draw();
}

// ---------------------------------------------------------------- library helpers
async function library(category) {
  const docs = await rpc('library_status', { p_company: ctx.isAdmin ? ctx.company : null });
  return category ? docs.filter(d => d.category === category) : docs;
}
function docTable(docs, showCounts) {
  return table(docs, [
    { label: 'Document', cell: d => `<b>${esc(d.title)}</b>${d.master ? ' <span class="tag">Clearpath library</span>' : ''}<br><span class="note">${d.current_version ? `Version ${d.current_version}: ${esc(d.summary)}` : 'Not published yet'}</span>` },
    { label: 'Review due', cell: d => date(d.review_due) },
    ...(showCounts ? [{ label: 'Signed', num: true, cell: d => d.needs_signature && d.current_version ? `${d.signed_count ?? 0} of ${d.user_count ?? 0}` : '—' }] : []),
    { label: 'You', cell: d => !d.needs_signature || !d.current_version ? '—' : d.i_signed ? pill('green', 'Signed') : `<button class="btn small" data-sign="${d.id}">Read and sign</button>` },
  ], 'No documents yet.');
}
function bindSign(root, redraw) {
  root.querySelectorAll('[data-sign]').forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await rpc('acknowledge_document', { p_document: b.dataset.sign }); toast('Signed: thank you'); redraw(); } catch (x) { toast(x.message, 'error'); b.disabled = false; }
  });
}

// ---------------------------------------------------------------- Health and Safety
async function hs(main) {
  const since = addDays(ctx.day, -90);
  const [incidents, docs] = await Promise.all([q('incidents', { occurred_at: `gte.${since}`, order: 'occurred_at.desc', limit: 200 }), library('health_safety')]);
  const open = incidents.filter(i => i.status === 'open');
  main.innerHTML = head('Health and Safety', 'Accidents, personal accidents and near misses, open actions, and the policies everyone must read.',
    `<button class="btn primary" id="report" type="button">Report an incident</button>`) + figures('hs') +
    card(`Open incidents (${open.length})`, incidentTable(open), 'Anything still open, newest first.') +
    card('All incidents in the last 90 days', incidentTable(incidents)) +
    `<section class="card" id="docs"><h2>Health and Safety policies</h2>${docTable(docs, level('compliance') === 'full')}</section>`;
  main.querySelector('#report').onclick = () => dialog({
    title: 'Report an incident', intro: 'Everyone with Health and Safety access can report. A manager reviews and closes it.', submit: 'Report incident',
    fields: [
      { name: 'kind', label: 'Type', type: 'select', options: [['near_miss', 'Near miss'], ['accident', 'Accident'], ['personal_accident', 'Personal accident']], required: true },
      { name: 'when', label: 'When it happened', type: 'datetime-local', value: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), required: true },
      { name: 'division', label: 'Area', type: 'select', options: DIV, value: ctx.profile.division || '' },
      { name: 'severity', label: 'Severity', type: 'select', options: [['', 'Not known yet'], ['minor', 'Minor'], ['serious', 'Serious'], ['riddor', 'Reportable under RIDDOR']] },
      { name: 'description', label: 'What happened', type: 'textarea', required: true },
    ],
    onSubmit: async v => {
      await rpc('log_incident', { p_kind: v.kind, p_occurred_at: new Date(v.when).toISOString(), p_description: v.description, p_division: v.division || null, p_severity: v.severity || null });
      toast('Incident reported'); hs(main);
    },
  });
  main.querySelectorAll('[data-incident]').forEach(b => b.onclick = () => {
    const i = incidents.find(x => x.id === b.dataset.incident);
    dialog({ title: 'Update incident', intro: esc(i.description), submit: 'Save',
      fields: [{ name: 'actions', label: 'Open actions', type: 'number', value: i.actions_open, required: true },
        { name: 'status', label: 'Status', type: 'select', options: [['open', 'Open'], ['closed', 'Closed']], value: i.status }],
      onSubmit: async v => { await rpc('update_incident', { p_id: i.id, p_status: v.status, p_actions_open: Number(v.actions) }); toast('Incident updated'); hs(main); } });
  });
  bindSign(main.querySelector('#docs'), () => hs(main));
  await comments(main, 'hs');
}
function incidentTable(rows) {
  return table(rows, [
    { label: 'When', cell: i => dateTime(i.occurred_at) },
    { label: 'Type', cell: i => esc(KIND[i.kind]) + (i.severity ? `<br><span class="note">${esc(label(i.severity))}</span>` : '') },
    { label: 'Area', cell: i => esc(label(i.division) || 'Company-wide') },
    { label: 'What happened', cell: i => esc(i.description) },
    { label: 'Actions open', num: true, cell: i => i.actions_open },
    { label: 'Status', cell: i => (i.status === 'open' ? pill('amber', 'Open') : pill('green', 'Closed')) + (isManager() ? ` <button class="btn small ghost" data-incident="${i.id}">Update</button>` : '') },
  ], 'No incidents recorded in this period.');
}

// ---------------------------------------------------------------- Service
async function service(main) {
  const [jobs, customers, wh] = await Promise.all([
    q('jobs', { job_date: `eq.${ctx.day}`, order: 'due_at.asc' }),
    q('customers', { order: 'name.asc' }),
    q('warehouse_daily', { day: `gte.${addDays(ctx.day, -13)}`, order: 'day.desc' }),
  ]);
  const cust = byId(customers);
  const late = j => j.delivered_at && j.due_at && j.delivered_at > j.due_at;
  jobs.forEach(j => { if (late(j) || j.in_full === false) j._cls = 'row-warn'; });
  main.innerHTML = head('Service', 'On time and in full, warehouse work rate and picking. Late or short deliveries are highlighted.') + figures('service') +
    (level('service') === 'full' || ctx.profile.division === 'transport' || ctx.isAdmin ? card(`Jobs on ${date(ctx.day)} (${jobs.length})`, table(jobs, [
      { label: 'Job', cell: j => esc(j.job_ref) },
      { label: 'Customer', cell: j => esc(cust[j.customer_id]?.name || '—') },
      { label: 'Due', cell: j => time(j.due_at) },
      { label: 'Delivered', cell: j => time(j.delivered_at) },
      { label: 'On time', cell: j => !j.delivered_at ? '—' : late(j) ? pill('red', 'Late') : pill('green', 'Yes') },
      { label: 'In full', cell: j => j.in_full === false ? pill('red', 'Short') : j.in_full ? pill('green', 'Yes') : '—' },
      { label: 'POD', cell: j => j.pod_received ? 'Received' : '<span class="warn-text">Missing</span>' },
    ], 'No jobs for this day.')) : '') +
    (wh.length ? card('Warehouse: last 14 days', table(wh, [
      { label: 'Day', cell: w => date(w.day) }, { label: 'Cases', num: true, cell: w => fmtValue(w.cases) }, { label: 'Picks', num: true, cell: w => fmtValue(w.picks) },
      { label: 'Labour hours', num: true, cell: w => fmtValue(w.labour_hours) },
      { label: 'Picks per hour', num: true, cell: w => w.labour_hours ? (w.picks / w.labour_hours).toFixed(1) : '—' },
      { label: 'Cases per hour', num: true, cell: w => w.labour_hours ? (w.cases / w.labour_hours).toFixed(1) : '—' },
    ], '')) : '');
  await comments(main, 'service');
}

// ---------------------------------------------------------------- Cost
async function cost(main) {
  const from = addDays(ctx.day, -13);
  const [jobs, costs, daily, wh, pnl] = await Promise.all([
    q('jobs', { job_date: `eq.${ctx.day}` }), q('job_costs', {}),
    q('cost_daily', { day: `gte.${from}`, order: 'day.desc' }), q('warehouse_daily', { day: `gte.${from}` }),
    level('pnl') === 'none' ? [] : q('pnl_lines', { order: 'month.desc' }),
  ]);
  const jc = Object.fromEntries(costs.map(c => [c.job_id, c]));
  const rows = jobs.filter(j => jc[j.id]).map(j => ({ ...j, ...jc[j.id], ref: j.job_ref }));
  rows.forEach(r => { const v = r.planned_cost ? (r.actual_cost - r.planned_cost) / r.planned_cost * 100 : null; r.var = v; if (v > 5) r._cls = 'row-warn'; });
  rows.sort((a, b) => (b.var ?? -999) - (a.var ?? -999));
  const cases = Object.fromEntries(wh.map(w => [w.day, w.cases]));
  const byDay = {}; daily.filter(c => c.division === 'warehouse').forEach(c => byDay[c.day] = (byDay[c.day] || 0) + c.amount);
  const months = {}; pnl.forEach(l => { months[l.month] ??= { month: l.month, revenue: 0, cost_of_sales: 0, overheads: 0, other: 0 }; months[l.month][l.category] += l.amount; });
  main.innerHTML = head('Cost', 'Revenue against plan, job costs against plan, warehouse cost per case' + (level('pnl') !== 'none' ? ' and the company P&L.' : '.')) + figures('cost') +
    (rows.length ? card(`Job costs on ${date(ctx.day)}`, table(rows, [
      { label: 'Job', cell: r => esc(r.ref) }, { label: 'Revenue', num: true, cell: r => money(r.revenue) }, { label: 'Planned cost', num: true, cell: r => money(r.planned_cost) },
      { label: 'Actual cost', num: true, cell: r => money(r.actual_cost) },
      { label: 'Against plan', num: true, cell: r => r.var == null ? '—' : `${r.var > 0 ? '+' : ''}${r.var.toFixed(1)}%` },
    ], ''), 'Highest overrun first. Over 5% is highlighted.') : '') +
    (Object.keys(byDay).length ? card('Warehouse cost per case: last 14 days', table(Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).map(([d, amt]) => ({ d, amt, cases: cases[d] })), [
      { label: 'Day', cell: r => date(r.d) }, { label: 'Warehouse costs', num: true, cell: r => money(r.amt) }, { label: 'Cases', num: true, cell: r => fmtValue(r.cases) },
      { label: 'Cost per case', num: true, cell: r => r.cases ? money(r.amt / r.cases, 2) : '—' },
    ], '')) : '') +
    (level('pnl') !== 'none' ? card('Company profit and loss', table(Object.values(months), [
      { label: 'Month', cell: m => new Date(m.month + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) },
      { label: 'Revenue', num: true, cell: m => money(m.revenue) }, { label: 'Cost of sales', num: true, cell: m => money(m.cost_of_sales) },
      { label: 'Overheads', num: true, cell: m => money(m.overheads) }, { label: 'Net', num: true, cell: m => money(m.revenue - m.cost_of_sales - m.overheads + m.other) },
    ], 'No P&L yet. It arrives from Xero once connected.'), 'From Xero.') : '');
  await comments(main, 'cost');
}

// ---------------------------------------------------------------- People
async function people(main) {
  const [staff, events, counts, cases] = await Promise.all([
    q('staff', { status: 'eq.active', order: 'name.asc' }), q('people_events', { day: `gte.${addDays(ctx.day, -6)}` }),
    rpc('hr_case_counts'), level('people_detail') === 'none' ? [] : q('hr_cases', { closed_on: 'is.null', order: 'opened_on.desc' }),
  ]);
  const s = byId(staff); const nm = id => s[id] ? ctx.name(id, s[id].name, s[id].is_driver ? 'Driver' : 'Employee') : 'Former employee';
  const today = events.filter(e => e.day === ctx.day && ['absence', 'holiday'].includes(e.kind));
  const ot = {}; events.filter(e => e.kind === 'overtime').forEach(e => ot[e.staff_id] = (ot[e.staff_id] || 0) + Number(e.hours || 0));
  const wtd = events.filter(e => e.kind === 'wtd_breach');
  main.innerHTML = head('People', 'Absence, holiday, overtime and working time' + (ctx.access.division && level('people') === 'own' ? ` for ${ctx.access.division} staff` : '') + '.') + figures('people') +
    card(`Absent or on holiday on ${date(ctx.day)}`, table(today, [{ label: 'Name', cell: e => esc(nm(e.staff_id)) }, { label: 'Type', cell: e => esc(label(e.kind)) }, { label: 'Hours', num: true, cell: e => fmtValue(e.hours) }], 'Nobody absent or on holiday.')) +
    `<div class="grid2">` + card('Overtime: last 7 days', table(Object.entries(ot).sort((a, b) => b[1] - a[1]).map(([id, h]) => ({ id, h })), [{ label: 'Name', cell: r => esc(nm(r.id)) }, { label: 'Hours', num: true, cell: r => fmtValue(r.h) }], 'No overtime recorded.')) +
    card('Working time breaches: last 7 days', table(wtd, [{ label: 'Name', cell: e => esc(nm(e.staff_id)) }, { label: 'Day', cell: e => date(e.day) }, { label: 'Note', cell: e => esc(e.note || '') }], 'No breaches recorded.')) + `</div>` +
    card('Open disciplinary and grievance cases', table(counts, [{ label: 'Area', cell: c => esc(label(c.division) || 'Not assigned') }, { label: 'Type', cell: c => esc(label(c.kind)) }, { label: 'Open', num: true, cell: c => c.open_cases }], 'No open cases.'), 'Counts only.' + (cases.length ? ' Details below.' : '')) +
    (level('people_detail') !== 'none' ? card('Case details (restricted)', table(cases, [{ label: 'Name', cell: c => esc(nm(c.staff_id)) }, { label: 'Type', cell: c => esc(label(c.kind)) }, { label: 'Opened', cell: c => date(c.opened_on) }, { label: 'Detail', cell: c => esc(c.detail || '') }], 'No open cases.'), 'Only directors and the consultant can see this.') : '');
  await comments(main, 'people');
}

// ---------------------------------------------------------------- Compliance
const ITEM = { mot: 'MOT', pmi: 'Safety inspection', tacho_calibration: 'Tacho calibration', licence_check: 'Licence check', cpc: 'Driver CPC', driver_card: 'Driver card', training: 'Training', o_licence: 'O-licence', brc: 'BRC', fors: 'FORS', policy_review: 'Policy review', other: 'Other' };
async function compliance(main) {
  const [items, infringements, defects, vehicles, staff, docs] = await Promise.all([
    q('compliance_items', { done_date: 'is.null', order: 'due_date.asc' }), q('infringements', { occurred_on: `gte.${addDays(ctx.day, -29)}`, order: 'occurred_on.desc' }),
    q('defects', { rectified_at: 'is.null', order: 'reported_at.desc' }), q('vehicles', {}), q('staff', {}), library(null),
  ]);
  const v = byId(vehicles), s = byId(staff);
  const soon = items.filter(i => i.due_date <= addDays(ctx.day, 30));
  soon.forEach(i => { if (i.due_date < ctx.day) i._cls = 'row-bad'; else if (i.due_date <= addDays(ctx.day, 14)) i._cls = 'row-warn'; });
  main.innerHTML = head('Compliance', 'Vehicles, drivers, training, O-licence, BRC and FORS, with everything due or overdue first.') + figures('compliance') +
    card('Overdue and due in the next 30 days', table(soon, [
      { label: 'Item', cell: i => esc(ITEM[i.kind] || i.kind) }, { label: 'For', cell: i => esc(i.subject) },
      { label: 'Due', cell: i => date(i.due_date) },
      { label: 'Status', cell: i => { const n = daysBetween(ctx.day, i.due_date); return n < 0 ? pill('red', `${-n} day${n === -1 ? '' : 's'} overdue`) : n <= 14 ? pill('amber', `Due in ${n} day${n === 1 ? '' : 's'}`) : pill('green', `Due in ${n} days`); } },
    ], 'Nothing overdue or due in the next 30 days.')) +
    `<div class="grid2">` + card('Infringements: last 30 days', table(infringements, [
      { label: 'Day', cell: i => date(i.occurred_on) }, { label: 'Driver', cell: i => esc(s[i.staff_id] ? ctx.name(i.staff_id, s[i.staff_id].name, 'Driver') : '—') },
      { label: 'Infringement', cell: i => esc(i.infringement_type) }], 'No infringements recorded.'), 'From Tachomaster.') +
    card('Open vehicle defects', table(defects, [
      { label: 'Vehicle', cell: d => esc(v[d.vehicle_id]?.registration || '—') }, { label: 'Reported', cell: d => dateTime(d.reported_at) },
      { label: 'Defect', cell: d => esc(d.description) }, { label: 'Severity', cell: d => d.severity === 'dangerous' ? pill('red', 'Dangerous') : esc(label(d.severity)) }], 'No open defects.'), 'From PreDrive.') + `</div>` +
    `<section class="card" id="docs"><h2>Policy sign-off</h2>${docTable(docs, level('compliance') === 'full')}</section>`;
  bindSign(main.querySelector('#docs'), () => compliance(main));
  await comments(main, 'compliance');
}

// ---------------------------------------------------------------- Links
async function links(main) {
  const L = [
    ['Logistics UK', 'https://logistics.org.uk', 'Transport: the trade association for freight and logistics.'],
    ['UK Warehousing Association (UKWA)', 'https://www.ukwa.org.uk', 'Warehousing: the trade association for warehousing and logistics.'],
    ['DVSA: guide to maintaining roadworthiness', 'https://www.gov.uk/government/publications/guide-to-maintaining-roadworthiness', 'Walkaround checks, defect reporting and inspection records.'],
    ['FORS', 'https://www.fors-online.org.uk', 'Fleet Operator Recognition Scheme.'],
    ['BRCGS', 'https://www.brcgs.com', 'BRC standards for storage and distribution.'],
  ];
  main.innerHTML = head('Links', 'Useful external sites. Paul to confirm the final list.') +
    `<section class="card"><ul class="links">${L.map(([t, u, d]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(t)}</a><span class="note">${esc(d)}</span></li>`).join('')}</ul></section>`;
}

// ---------------------------------------------------------------- Records
const TABS = [['jobs', 'Jobs', 'service'], ['customers', 'Customers', 'records'], ['fleet', 'Fleet and vehicles', 'records'], ['staff', 'Staff', 'people'],
  ['hr-documents', 'HR documents', 'records'], ['hs-documents', 'H&S documents', 'hs'], ['payroll', 'Payroll', 'payroll']];
async function records(main, tab = 'jobs') {
  const tabs = TABS.filter(t => level(t[2]) !== 'none');
  if (!tabs.find(t => t[0] === tab)) tab = tabs[0]?.[0];
  main.innerHTML = head('Records', 'The records behind every figure.') + `<nav class="tabs" aria-label="Records">${tabs.map(t => `<a href="#/records/${t[0]}" class="${t[0] === tab ? 'on' : ''}">${t[1]}</a>`).join('')}</nav><section class="card" id="rec"><p class="loading">Loading…</p></section>`;
  const box = main.querySelector('#rec');
  if (tab === 'jobs') {
    const [jobs, customers] = await Promise.all([q('jobs', { order: 'job_date.desc', limit: 300 }), q('customers', {})]); const c = byId(customers);
    box.innerHTML = `<label class="fld search" for="find"><span>Find a job</span><input id="find" placeholder="Job number or customer"></label><div id="jt"></div>`;
    const draw = f => box.querySelector('#jt').innerHTML = table(jobs.filter(j => !f || (j.job_ref + ' ' + (c[j.customer_id]?.name || '')).toLowerCase().includes(f)), [
      { label: 'Job', cell: j => esc(j.job_ref) }, { label: 'Date', cell: j => date(j.job_date) }, { label: 'Customer', cell: j => esc(c[j.customer_id]?.name || '—') },
      { label: 'Status', cell: j => esc(label(j.status)) }, { label: 'POD', cell: j => j.pod_received ? 'Received' : 'Missing' }, { label: 'Source', cell: j => esc(label(j.source)) }], 'No jobs found.');
    draw(''); box.querySelector('#find').oninput = e => draw(e.target.value.toLowerCase().trim());
  } else if (tab === 'customers') {
    box.innerHTML = table(await q('customers', { order: 'name.asc' }), [{ label: 'Customer', cell: c => esc(c.name) }, { label: 'Account', cell: c => esc(c.account_code || '—') }, { label: 'Source', cell: c => esc(label(c.source)) }], 'No customers yet. They arrive from Vigo once connected.');
  } else if (tab === 'fleet') {
    const [vehicles, items] = await Promise.all([q('vehicles', { order: 'registration.asc' }), q('compliance_items', { done_date: 'is.null', order: 'due_date.asc' })]);
    box.innerHTML = table(vehicles, [{ label: 'Registration', cell: v => `<b>${esc(v.registration)}</b>` }, { label: 'Type', cell: v => esc(v.vehicle_type || '—') }, { label: 'Status', cell: v => esc(label(v.status)) },
      { label: 'Next due', cell: v => items.filter(i => i.vehicle_id === v.id).slice(0, 3).map(i => `${esc(ITEM[i.kind] || i.kind)}: ${date(i.due_date)}`).join('<br>') || '—' }], 'No vehicles yet.');
  } else if (tab === 'staff') {
    box.innerHTML = table(await q('staff', { order: 'name.asc' }), [{ label: 'Name', cell: s => esc(ctx.name(s.id, s.name, s.is_driver ? 'Driver' : 'Employee')) }, { label: 'Number', cell: s => esc(s.employee_no || '—') },
      { label: 'Area', cell: s => esc(label(s.division) || '—') }, { label: 'Driver', cell: s => s.is_driver ? 'Yes' : 'No' }, { label: 'Status', cell: s => esc(label(s.status)) }], 'No staff yet.');
  } else if (tab === 'hr-documents' || tab === 'hs-documents') {
    const draw = async () => { box.innerHTML = docTable(await library(tab === 'hr-documents' ? 'hr' : 'health_safety'), level('compliance') === 'full'); bindSign(box, draw); };
    await draw();
  } else if (tab === 'payroll') {
    box.innerHTML = table(await q('payroll_periods', { order: 'period_end.desc' }), [{ label: 'Period ending', cell: p => date(p.period_end) }, { label: 'Gross pay', num: true, cell: p => money(p.gross_pay) },
      { label: 'Employer costs', num: true, cell: p => money(p.employer_costs) }, { label: 'Hours', num: true, cell: p => fmtValue(p.hours) }, { label: 'Overtime hours', num: true, cell: p => fmtValue(p.overtime_hours) }], 'No payroll yet. It arrives from BrightPay exports.');
  }
}

export const PAGES = { hs, service, cost, people, compliance, links, records };
