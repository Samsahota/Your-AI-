// Users and settings (directors) and the admin console (platform admin).
import { rpc, select, fn } from './api.js';
import { esc, pill, money, date, dateTime, table, dialog, toast, label, fmtValue } from './ui.js';
import { ctx, q, roleName, openCompany, loadDashboard } from './app.js';
import { processCsv, sha256 } from '/connectors/core.mjs';
import { CATALOGUE, TEMPLATES } from '/connectors/catalogue.mjs';

const METHOD = { api: 'Supplier API', oauth: 'Approved read-only sign-in', email_report: 'Scheduled emailed report', file: 'File upload' };
const SCHEDULE = { every_15_min: 'Every 15 minutes', hourly: 'Hourly', nightly: 'Nightly', on_receipt: 'When a file arrives' };
const head = (title, sub, actions = '') => `<header class="page-head"><div><h1>${esc(title)}</h1><p class="sub">${sub}</p></div><div class="head-actions">${actions}</div></header>`;
const tabs = (base, list, on) => `<nav class="tabs" aria-label="Sections">${list.map(([k, l]) => `<a href="#/${base}/${k}" class="${k === on ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
const card = (title, body, sub = '') => `<section class="card"><h2>${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}${body}</section>`;
const ROLES = [['director', 'Director'], ['consultant', 'Consultant (full access)'], ['operations', 'Operations Manager'], ['transport', 'Transport Manager'], ['warehouse', 'Warehouse Manager']];
const LEVELS = [['none', 'No access'], ['own', 'Own area'], ['full', 'Full']];
const AREA = { dashboard: 'Dashboard', hs: 'Health and Safety', service: 'Service', cost: 'Cost', pnl: 'Company P&L', people: 'People', people_detail: 'Disciplinary detail', payroll: 'Payroll', compliance: 'Compliance', records: 'Records', settings: 'Users and settings' };
const CONN_STATUS = { waiting_access: ['no_data', 'Waiting for access'], configured: ['no_target', 'Set up, not yet run'], connected: ['green', 'Connected'], failing: ['red', 'Failing'], paused: ['no_data', 'Paused'] };
const connPill = s => pill(...(CONN_STATUS[s] || ['no_data', s]));
const companyArg = () => ctx.isAdmin ? ctx.company : null;

// ================================================================ Users and settings (director)
const SETTINGS = [['users', 'Users'], ['access', 'Access levels'], ['targets', 'Targets'], ['connections', 'Connections'], ['library', 'Documents'], ['activity', 'Activity']];

async function settings(main, tab) {
  main.innerHTML = head('Users and settings', esc(ctx.dash?.company || '')) + tabs('settings', SETTINGS, tab) + `<div id="pane"><p class="loading">Loading…</p></div>`;
  const pane = main.querySelector('#pane');
  await ({ users, access, targets, connections, library: docs, activity }[tab] || users)(pane);
}

async function users(pane) {
  const rows = await q('profiles', { order: 'name.asc' });
  pane.innerHTML = card('Users', table(rows, [
    { label: 'Name', cell: p => `<b>${esc(p.name)}</b>${p.is_test ? ' <span class="tag">Test login</span>' : ''}<br><span class="note">${esc(p.email)}</span>` },
    { label: 'Role', cell: p => esc(roleName(p.role)) + (p.division ? `<br><span class="note">${esc(label(p.division))}</span>` : '') },
    { label: 'Status', cell: p => p.status === 'active' ? pill('green', 'Active') : p.status === 'invited' ? pill('no_target', 'Invited') : pill('red', 'Suspended') },
    { label: '', cell: p => p.user_id === ctx.profile.user_id || p.status === 'invited' ? '' : `<button class="btn small ghost" data-status="${p.user_id}" data-to="${p.status === 'active' ? 'suspended' : 'active'}">${p.status === 'active' ? 'Suspend' : 'Reactivate'}</button>` },
  ], 'No users yet.'), 'Everyone signs in with two-factor. Suspend leavers the same day.') ;
  pane.insertAdjacentHTML('afterbegin', `<div class="bar"><button class="btn primary" id="invite" type="button">Invite someone</button></div>`);
  pane.querySelector('#invite').onclick = () => dialog({
    title: 'Invite someone', intro: 'They get an email to set a password, then set up two-factor sign-in on their phone.', submit: 'Send invitation',
    fields: [{ name: 'name', label: 'Full name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'job_title', label: 'Job title' },
      { name: 'role', label: 'Access level', type: 'select', options: ROLES, required: true },
      { name: 'division', label: 'Area (Transport and Warehouse Managers)', type: 'select', options: [['', 'Not needed'], ['transport', 'Transport'], ['warehouse', 'Warehouse']] },
      { name: 'is_test', label: 'This is a test login (e.g. Clearpath)', type: 'checkbox' }],
    onSubmit: async v => {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) throw new Error('Enter a valid email address.');
      const r = await fn('invite-user', { company_id: ctx.company, ...v, division: v.division || null });
      toast(`Invitation sent to ${r.invited}`); users(pane);
    },
  });
  pane.querySelectorAll('[data-status]').forEach(b => b.onclick = async () => {
    try { await rpc('set_user_status', { p_user: b.dataset.status, p_status: b.dataset.to }); toast(b.dataset.to === 'suspended' ? 'User suspended: they can no longer sign in to anything' : 'User reactivated'); users(pane); }
    catch (x) { toast(x.message, 'error'); }
  });
}

async function access(pane) {
  const [matrix, overrides] = await Promise.all([select('role_access', {}), q('access_overrides', {})]);
  const lv = (r, a) => overrides.find(o => o.role === r && o.area === a)?.level || matrix.find(m => m.role === r && m.area === a)?.level || 'none';
  const changed = (r, a) => overrides.some(o => o.role === r && o.area === a);
  const editable = ctx.profile.role === 'director';
  const roles = ROLES.filter(r => r[0] !== 'director');
  pane.innerHTML = card('Access levels', `<div class="tbl"><table class="matrix"><thead><tr><th>Area</th><th>Director</th>${roles.map(r => `<th>${esc(r[1])}</th>`).join('')}</tr></thead><tbody>
    ${Object.entries(AREA).map(([a, l]) => `<tr><td>${esc(l)}</td><td><span class="lvl lvl-full">Full</span></td>${roles.map(([r]) => `<td>${editable
      ? `<select aria-label="${esc(l)} for ${esc(roleName(r))}" data-role="${r}" data-area="${a}" class="${changed(r, a) ? 'changed' : ''}">${LEVELS.map(([k, t]) => `<option value="${k}" ${lv(r, a) === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`
      : `<span class="lvl lvl-${lv(r, a)}">${LEVELS.find(x => x[0] === lv(r, a))[1]}</span>`}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
    '"Own area" means their own division only (transport or warehouse). Changes apply straight away and are logged. Highlighted cells differ from the standard levels.');
  pane.querySelectorAll('select[data-role]').forEach(s => s.onchange = async () => {
    try { await rpc('set_access_override', { p_role: s.dataset.role, p_area: s.dataset.area, p_level: s.value }); s.classList.add('changed'); toast(`${roleName(s.dataset.role)}: ${AREA[s.dataset.area]} set to ${LEVELS.find(x => x[0] === s.value)[1].toLowerCase()}`); }
    catch (x) { toast(x.message, 'error'); access(pane); }
  });
}

async function targets(pane) {
  const [measures, th] = await Promise.all([select('measures', { order: 'quadrant.asc,sort.asc' }), q('thresholds', {})]);
  const t = Object.fromEntries(th.map(x => [x.measure_code, x]));
  const QN = { hs: 'Health and Safety', service: 'Service', cost: 'Cost', people: 'People', compliance: 'Compliance' };
  const canEdit = ctx.profile.role === 'director' || ctx.isAdmin;
  pane.innerHTML = card('Targets', table(measures, [
    { label: 'Figure', cell: m => `<b>${esc(m.name)}</b><br><span class="note">${esc(QN[m.quadrant])} · ${esc(m.description)}</span>` },
    { label: 'Better when', cell: m => m.better === 'higher' ? 'Higher' : 'Lower' },
    { label: 'Green at', num: true, cell: m => fmtValue(t[m.code]?.green_at ?? m.default_green, m.unit) },
    { label: 'Amber at', num: true, cell: m => fmtValue(t[m.code]?.amber_at ?? m.default_amber, m.unit) },
    { label: '', cell: m => (t[m.code] ? '<span class="tag">Your target</span> ' : m.default_green == null ? '<span class="tag">Not set</span> ' : '<span class="tag">Standard</span> ') + (canEdit ? `<button class="btn small ghost" data-measure="${m.code}">Change</button>` : '') },
  ], ''), 'What turns each figure green, amber or red. Anything worse than amber is red.');
  pane.querySelectorAll('[data-measure]').forEach(b => b.onclick = () => {
    const m = measures.find(x => x.code === b.dataset.measure);
    dialog({ title: m.name, intro: `${m.better === 'higher' ? 'Higher' : 'Lower'} is better. Green when the figure is ${m.better === 'higher' ? 'at or above' : 'at or below'} the green level; amber down to the amber level; red beyond it.`, submit: 'Save target',
      fields: [{ name: 'green', label: `Green level (${m.unit})`, type: 'number', step: 'any', value: t[m.code]?.green_at ?? m.default_green ?? '', required: true },
        { name: 'amber', label: `Amber level (${m.unit})`, type: 'number', step: 'any', value: t[m.code]?.amber_at ?? m.default_amber ?? '', required: true }],
      onSubmit: async v => { await rpc('set_threshold', { p_measure: m.code, p_green: Number(v.green), p_amber: Number(v.amber), p_company: companyArg() }); await loadDashboard(); toast(`Target saved for ${m.name}`); targets(pane); } });
  });
}

async function connections(pane, adminView = false) {
  const [conns, runs] = await Promise.all([q('connections', { order: 'system.asc' }), q('connection_runs', { order: 'started_at.desc', limit: 30 })]);
  const byConn = Object.fromEntries(conns.map(c => [c.id, c]));
  pane.innerHTML = card('Connections', table(conns, [
    { label: 'System', cell: c => `<b>${esc(c.label)}</b><br><span class="note">${esc(CATALOGUE[c.system]?.notes || '')}</span>` },
    { label: 'How', cell: c => esc(METHOD[c.method] || label(c.method)) + `<br><span class="note">${esc(SCHEDULE[c.schedule] || label(c.schedule))}</span>` },
    { label: 'Status', cell: c => connPill(c.status) + (c.last_error ? `<br><span class="note warn-text">${esc(c.last_error)}</span>` : '') },
    { label: 'Last good update', cell: c => c.last_success_at ? dateTime(c.last_success_at) : '—' },
    ...(adminView ? [{ label: '', cell: c => `<button class="btn small ghost" data-edit="${c.id}">Edit</button>` }] : []),
  ], 'No connections set up yet.'), adminView ? 'Keys never go here: they go in the vault, and only the vault name is stored.' : 'Your AI sets these up. A failing connection greys out its figures until it is fixed.') +
    card('Recent runs', table(runs, [
      { label: 'When', cell: r => dateTime(r.started_at) }, { label: 'Connection', cell: r => esc(byConn[r.connection_id]?.label || '') },
      { label: 'Result', cell: r => r.status === 'ok' ? pill('green', 'OK') : pill('red', r.status === 'check_failed' ? 'Check failed' : 'Failed') },
      { label: 'Rows', num: true, cell: r => `${r.rows_written ?? 0} of ${r.rows_in ?? 0}` },
      { label: 'Checks', cell: r => (r.checks || []).map(c => `${c.passed ? '✓' : '✗'} ${esc(c.name)}${c.passed || !c.message ? '' : `: ${esc(c.message)}`}`).join('<br>') || esc(r.error || '') },
    ], 'No runs yet.'));
  if (!adminView) return;
  pane.insertAdjacentHTML('afterbegin', `<div class="bar"><button class="btn primary" id="add" type="button">Add a connection</button></div>`);
  const edit = c => dialog({
    title: c ? `Edit: ${c.label}` : 'Add a connection', submit: 'Save connection',
    intro: c ? '' : 'Pick the system. Most start as "waiting for access" until the supplier provides it.',
    fields: [
      ...(c ? [] : [{ name: 'system', label: 'System', type: 'select', options: Object.entries(CATALOGUE).map(([k, v]) => [k, v.name]), required: true }, { name: 'label', label: 'Name (e.g. "Accident log")', required: true }]),
      { name: 'method', label: 'How data arrives', type: 'select', options: [['api', 'API (key in the vault)'], ['oauth', 'Allow button (Xero, Microsoft)'], ['email_report', 'Emailed report'], ['file', 'File upload']], value: c?.method || 'file', required: true },
      { name: 'schedule', label: 'How often', type: 'select', options: [['nightly', 'Nightly'], ['hourly', 'Hourly'], ['every_15_min', 'Every 15 minutes'], ['on_receipt', 'When a file or report arrives']], value: c?.schedule || 'nightly' },
      { name: 'secret_name', label: 'Vault secret name (API connections only)', value: c?.secret_name || '', hint: 'The name only, e.g. VIGO_KEY_TRANSHAUL. Never paste a key here.' },
      { name: 'status', label: 'Status', type: 'select', options: [['waiting_access', 'Waiting for access'], ['configured', 'Set up, not yet run'], ['paused', 'Paused']], value: c && ['waiting_access', 'configured', 'paused'].includes(c.status) ? c.status : 'waiting_access' },
    ],
    onSubmit: async v => {
      const sys = c?.system || v.system;
      await rpc('save_connection', { p_company: ctx.company, p_system: sys, p_label: c?.label || v.label, p_method: v.method, p_feeds: c?.feeds || CATALOGUE[sys].feeds,
        p_schedule: v.schedule, p_config: c?.config || {}, p_secret_name: v.secret_name || null, p_status: v.status });
      toast('Connection saved'); connections(pane, true);
    },
  });
  pane.querySelector('#add').onclick = () => edit(null);
  pane.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => edit(byConn[b.dataset.edit]));
}

async function docs(pane, master = false) {
  const all = master ? await select('library_documents', { company_id: 'is.null', order: 'title.asc' }) : await q('library_documents', { order: 'title.asc' });
  const companies = master ? await select('companies', { order: 'name.asc' }) : [];
  const subs = master ? await select('library_subscriptions', {}) : [];
  const CAT = [['health_safety', 'Health and Safety'], ['hr', 'HR'], ['transport', 'Transport'], ['warehouse', 'Warehouse'], ['legal', 'Legal'], ['other', 'Other']];
  pane.innerHTML = `<div class="bar"><button class="btn primary" id="newdoc" type="button">Add a document</button></div>` + card(master ? 'Clearpath master library' : 'Company documents', table(all, [
    { label: 'Document', cell: d => `<b>${esc(d.title)}</b><br><span class="note">${esc(CAT.find(c => c[0] === d.category)?.[1])}${d.owner_name ? ' · owner ' + esc(d.owner_name) : ''}</span>` },
    { label: 'Version', num: true, cell: d => d.current_version || '—' }, { label: 'Review due', cell: d => date(d.review_due) },
    ...(master ? [{ label: 'Companies using it', cell: d => companies.map(c => `<label class="chk-inline"><input type="checkbox" data-sub="${d.id}" data-co="${c.id}" ${subs.some(s => s.document_id === d.id && s.company_id === c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('<br>') }] : []),
    { label: '', cell: d => `<button class="btn small ghost" data-publish="${d.id}">Publish new version</button>` },
  ], 'No documents yet.'), master ? 'Master documents reach every company ticked. Publishing a new version asks everyone to sign again.' : 'Your own policies and procedures. Clearpath\'s master documents appear on the Health and Safety and Records pages.');
  pane.querySelector('#newdoc').onclick = () => dialog({ title: 'Add a document', submit: 'Add document',
    fields: [{ name: 'title', label: 'Title', required: true }, { name: 'category', label: 'Category', type: 'select', options: CAT, required: true },
      { name: 'owner', label: 'Owner' }, { name: 'review', label: 'Review due', type: 'date' }, { name: 'sign', label: 'Staff must read and sign it', type: 'checkbox', value: true }],
    onSubmit: async v => { await rpc('create_document', { p_company: master ? null : ctx.company, p_category: v.category, p_title: v.title, p_owner_name: v.owner || null, p_review_due: v.review || null, p_needs_signature: v.sign }); toast('Document added. Publish its first version next.'); docs(pane, master); } });
  pane.querySelectorAll('[data-publish]').forEach(b => b.onclick = () => dialog({ title: 'Publish a new version', intro: 'Staff who must sign will be asked to read and sign this version.', submit: 'Publish',
    fields: [{ name: 'path', label: 'File location', required: true, hint: 'Where the PDF is stored. Uploading the file itself is switched on with hosting.' }, { name: 'summary', label: 'What changed', type: 'textarea', required: true }],
    onSubmit: async v => { const n = await rpc('publish_document_version', { p_document: b.dataset.publish, p_storage_path: v.path, p_summary: v.summary }); toast(`Version ${n} published`); docs(pane, master); } }));
  pane.querySelectorAll('[data-sub]').forEach(c => c.onchange = async () => {
    try { await rpc('set_subscription', { p_company: c.dataset.co, p_document: c.dataset.sub, p_on: c.checked }); toast(c.checked ? 'Company added' : 'Company removed'); }
    catch (x) { toast(x.message, 'error'); c.checked = !c.checked; }
  });
}

async function activity(pane) {
  const rows = await q('audit_log', { order: 'at.desc', limit: 100 });
  pane.innerHTML = card('Activity', table(rows, [{ label: 'When', cell: a => dateTime(a.at) }, { label: 'Who', cell: a => esc(roleName(a.actor_role) || 'Platform') },
    { label: 'What', cell: a => esc(label(a.action)) }, { label: 'Detail', cell: a => esc([a.target, ...Object.entries(a.detail || {}).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(' · ')) }], 'No activity yet.'), 'Every change to users, access, targets, connections and documents.');
}

// ================================================================ Admin console (platform admin)
const ADMIN = [['companies', 'Companies'], ['connections', 'Connections'], ['import', 'Import a file'], ['library', 'Master library'], ['health', 'Health']];

async function admin(main, tab) {
  const co = ctx.dash?.company;
  main.innerHTML = head('Admin console', co ? `Working in <b>${esc(co)}</b>. Switch company from Companies.` : 'Open a company to work on its connections and pages.') + tabs('admin', ADMIN, tab) + `<div id="pane"><p class="loading">Loading…</p></div>`;
  const pane = main.querySelector('#pane');
  if (['connections', 'import'].includes(tab) && !ctx.company) { pane.innerHTML = card('Choose a company first', '<a class="btn primary" href="#/admin/companies">Companies</a>'); return; }
  await ({ companies, connections: p => connections(p, true), import: importFile, library: p => docs(p, true), health }[tab] || companies)(pane);
}

async function companies(pane) {
  const [rows, profiles] = await Promise.all([select('companies', { order: 'name.asc' }), select('profiles', {})]);
  pane.innerHTML = `<div class="bar"><button class="btn primary" id="newco" type="button">Add a company</button></div>` + card('Companies', table(rows, [
    { label: 'Company', cell: c => `<b>${esc(c.name)}</b>${c.id === ctx.company ? ' <span class="tag">Open</span>' : ''}` },
    { label: 'Deal', cell: c => c.deal === 'founding' ? 'Founding' : 'Standard' },
    { label: 'Setup', num: true, cell: c => money(c.setup_fee) }, { label: 'Monthly', num: true, cell: c => money(c.monthly_fee) },
    { label: 'Users', num: true, cell: c => profiles.filter(p => p.company_id === c.id && p.status !== 'suspended').length },
    { label: 'Status', cell: c => `<select aria-label="Status of ${esc(c.name)}" data-costatus="${c.id}">${['setup', 'active', 'suspended'].map(s => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>` },
    { label: '', cell: c => `<button class="btn small" data-open="${c.id}">Open</button>` },
  ], 'No companies yet.'), 'Standard deal: £5,000 setup (60/40 to Your AI), £500 a month (50/50). Trans Haul: founding deal.') +
    (ctx.company ? card('Recalculate figures', `<form class="inline" id="recalc"><label class="fld" for="rday"><span>Day</span><input id="rday" type="date" value="${ctx.day || new Date().toISOString().slice(0, 10)}"></label><button class="btn" type="submit">Recalculate</button></form>`, 'Works out every figure for the open company from its records. Runs automatically each night once hosted.') : '');
  pane.querySelector('#newco').onclick = () => dialog({ title: 'Add a company', submit: 'Add company',
    fields: [{ name: 'name', label: 'Company name', required: true }, { name: 'slug', label: 'Short name for its web address', required: true, hint: 'Lower case letters, numbers and hyphens, e.g. trans-haul' },
      { name: 'deal', label: 'Deal', type: 'select', options: [['standard', 'Standard (£5,000 + £500 a month)'], ['founding', 'Founding']], required: true },
      { name: 'setup', label: 'Setup fee (£)', type: 'number', value: 5000, required: true }, { name: 'monthly', label: 'Monthly fee (£)', type: 'number', value: 500, required: true }],
    onSubmit: async v => { await rpc('create_company', { p_name: v.name, p_slug: v.slug, p_deal: v.deal, p_setup_fee: Number(v.setup), p_monthly_fee: Number(v.monthly) }); toast(`${v.name} added`); companies(pane); } });
  pane.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openCompany(b.dataset.open));
  pane.querySelectorAll('[data-costatus]').forEach(s => s.onchange = async () => { try { await rpc('set_company_status', { p_company: s.dataset.costatus, p_status: s.value }); toast('Status changed'); } catch (x) { toast(x.message, 'error'); } });
  const rf = pane.querySelector('#recalc');
  if (rf) rf.onsubmit = async e => { e.preventDefault(); try { const n = await rpc('compute_measures', { p_company: ctx.company, p_day: rf.querySelector('input').value }); await loadDashboard(); toast(`${n} figures recalculated`); } catch (x) { toast(x.message, 'error'); } };
}

async function importFile(pane) {
  const conns = (await q('connections', { order: 'label.asc' })).filter(c => c.feeds.some(f => TARGETS[f]));
  pane.innerHTML = card('Import a file', !conns.length ? '<p class="empty">Add a connection that fills incidents, staff, absence, compliance dates or warehouse figures first.</p>' : `
    <form id="imp" class="imp" novalidate>
      <label class="fld" for="iconn"><span>Connection</span><select id="iconn">${conns.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></label>
      <label class="fld" for="itarget"><span>What the file contains</span><select id="itarget"></select></label>
      <label class="fld" for="imap"><span>Column mapping</span><textarea id="imap" rows="8" spellcheck="false"></textarea><small>Starts from our spreadsheet template. Change the column names on the left of "from" to match the file.</small></label>
      <div class="grid2"><label class="fld" for="irows"><span>Rows the source says it has (optional)</span><input id="irows" type="number"></label>
      <label class="fld" for="ifile"><span>CSV file</span><input id="ifile" type="file" accept=".csv,text/csv"></label></div>
      <button class="btn primary" type="submit">Check the file</button></form><div id="result"></div>`,
    'Reads the file, checks every row and the totals, and only then writes. Nothing is written if any check fails.');
  if (!conns.length) return;
  const f = pane.querySelector('#imp'), sel = f.querySelector('#itarget'), map = f.querySelector('#imap');
  const fillTargets = () => { const c = conns.find(x => x.id === f.querySelector('#iconn').value); sel.innerHTML = c.feeds.filter(t => TARGETS[t]).map(t => `<option value="${t}">${TARGETS[t].label}</option>`).join(''); fillMap(); };
  const fillMap = () => { map.value = JSON.stringify(TARGETS[sel.value].mapping, null, 2); };
  f.querySelector('#iconn').onchange = fillTargets; sel.onchange = fillMap; fillTargets();
  f.onsubmit = async e => {
    e.preventDefault(); const out = pane.querySelector('#result');
    const file = f.querySelector('#ifile').files[0]; if (!file) { out.innerHTML = '<p class="form-error">Choose a CSV file.</p>'; return; }
    let mapping; try { mapping = JSON.parse(map.value); } catch (x) { out.innerHTML = `<p class="form-error">The mapping isn't valid: ${esc(x.message)}</p>`; return; }
    const text = await file.text(); const rows = f.querySelector('#irows').value;
    const r = processCsv(text, mapping, rows ? { rowCount: Number(rows) } : {});
    const sha = await sha256(text);
    out.innerHTML = card('Checks', `<ul class="checks">${r.checks.map(c => `<li>${c.passed ? pill('green', 'Passed') : pill('red', 'Failed')} ${esc(c.name)}${c.message ? `: ${esc(c.message)}` : ''}</li>`).join('')}</ul>` +
      (r.errors?.length ? table(r.errors.slice(0, 20), [{ label: 'Row', num: true, cell: x => x.row }, { label: 'Column', cell: x => esc(x.column) }, { label: 'Problem', cell: x => esc(x.problem) }], '') : '') +
      (r.records.length ? `<p class="sub">First rows as they will be written:</p>` + table(r.records.slice(0, 5), Object.keys(r.records[0]).map(k => ({ label: k, cell: x => esc(x[k] ?? '') })), '') : '') +
      `<div class="bar">${r.status === 'ok' ? `<button class="btn primary" id="write" type="button">Write ${r.records.length} records</button>` : `<button class="btn" id="write" type="button">Record this failed run</button>`}</div>`);
    out.querySelector('#write').onclick = async ev => {
      ev.target.disabled = true;
      try {
        const res = await rpc('import_records', { p_connection: f.querySelector('#iconn').value, p_target: sel.value, p_records: r.records, p_checks: r.checks, p_rows_in: r.rowsIn, p_raw_sha: sha });
        if (res.status === 'ok' && ctx.day) { await rpc('compute_measures', { p_company: ctx.company, p_day: ctx.day }); await loadDashboard(); }
        toast(res.status === 'ok' ? `${res.written} records written and figures recalculated` : 'Failed run recorded: the connection is marked failing', res.status === 'ok' ? 'ok' : 'error');
        out.innerHTML = '';
      } catch (x) { toast(x.message, 'error'); ev.target.disabled = false; }
    };
  };
}
const TARGETS = {
  incidents: { label: 'Accidents and near misses', mapping: TEMPLATES.incidents },
  people_events: { label: 'Holiday, absence and overtime', mapping: TEMPLATES.absence },
  staff: { label: 'Staff list', mapping: TEMPLATES.staff },
  compliance_items: { label: 'Compliance due dates', mapping: TEMPLATES.compliance },
  warehouse_daily: { label: 'Warehouse daily figures', mapping: TEMPLATES.warehouse },
};

async function health(pane) {
  const [conns, cos] = await Promise.all([select('connections', { order: 'company_id.asc' }), select('companies', {})]);
  const name = Object.fromEntries(cos.map(c => [c.id, c.name]));
  const bad = conns.filter(c => c.status === 'failing' || (c.status === 'connected' && c.last_success_at && Date.now() - new Date(c.last_success_at) > 36 * 3600e3));
  const waiting = conns.filter(c => c.status === 'waiting_access');
  pane.innerHTML = card(`Needs attention (${bad.length})`, table(bad, [{ label: 'Company', cell: c => esc(name[c.company_id]) }, { label: 'Connection', cell: c => esc(c.label) },
    { label: 'Status', cell: c => connPill(c.status) }, { label: 'Problem', cell: c => esc(c.last_error || 'No successful update in 36 hours') }, { label: 'Last good update', cell: c => c.last_success_at ? dateTime(c.last_success_at) : 'Never' }],
    'Everything connected is up to date.'), 'Failing or overdue connections across every company. Once hosted, this list is emailed to you at 6:30 each morning.') +
    card(`Waiting for access (${waiting.length})`, table(waiting, [{ label: 'Company', cell: c => esc(name[c.company_id]) }, { label: 'Connection', cell: c => esc(c.label) }, { label: 'Set up', cell: c => date(c.created_at) }], 'Nothing waiting.'));
}

export const MANAGE = { settings, admin };
