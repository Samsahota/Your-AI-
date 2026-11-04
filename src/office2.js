/* ==========================================================================
   OFFICE APP — Operations, Customers & Cash, Fleet & Compliance, Admin
   ========================================================================== */
const PRIORITY = { high:'<span class="pill bad">High</span>', medium:'<span class="pill warn">Medium</span>', low:'<span class="pill plain">Low</span>' };
function recordLabel(type, id) { if (!id) return '—'; return recLink(type, id, `${cap(type)} ${id}`); }
function actionsTable(list, compact) {
  if (!list.length) return `<div class="empty small"><h4>No actions</h4><p>Raise an action to assign follow-up work to a named owner.</p></div>`;
  return table({ cols: [
    { key:'title', label:'Action', render: a => `<div class="strong">${esc(a.title)}</div><div class="sub-line">${a.id}${a.progress.length ? ` · ${a.progress.length} update${a.progress.length > 1 ? 's' : ''}` : ''}</div>` },
    ...(compact ? [] : [{ key:'rec', label:'Linked record', render: a => a.recordId ? `${esc(cap(a.recordType))} ${esc(a.recordId)}` : '—' }]),
    { key:'owner', label:'Owner', render: a => esc(user(a.ownerId) ? user(a.ownerId).name : a.ownerId) },
    { key:'priority', label:'Priority', render: a => PRIORITY[a.priority] || '' },
    { key:'due', label:'Follow-up', render: a => `<span class="${a.status === 'open' && a.due < TODAY ? 'delta-bad' : ''}">${fmtDate(a.due)}</span>` },
    { key:'status', label:'Status', render: a => a.status === 'done' ? '<span class="pill ok">Completed</span>' : '<span class="pill">Open</span>' },
  ], rows: list, rowAttr: a => `class="clickable" data-act="openAction" data-id="${a.id}" tabindex="0"` });
}
function rechargeTable(list) {
  return table({ cols: [
    { key:'job', label:'Job', render: r => `<a class="link" href="#/job/${r.jobId}">${r.jobId}</a><div class="sub-line">${esc(custName(r.customerId))}</div>` },
    { key:'note', label:'Basis / note', render: r => `<span class="small">${esc(r.note)}</span>` },
    { key:'by', label:'Drafted', render: r => `${esc(user(r.createdBy).name)}<div class="sub-line">${fmtDT(r.createdAt)}</div>` },
    { key:'status', label:'Status', render: r => r.status === 'draft' ? '<span class="pill warn">Draft only</span>' : '<span class="pill plain">Cancelled</span>' },
    { key:'amount', label:'Amount', num:true, render: r => r.status === 'draft' ? gbp(r.amount) : `<s class="muted">${gbp(r.amount)}</s>` },
    { key:'x', label:'', num:true, render: r => !can('recharge') ? '' : r.status === 'draft' ? `<button class="btn btn-sm" data-act="editRecharge" data-id="${r.id}">Edit note</button> <button class="btn btn-sm btn-ghost" data-act="cancelRecharge" data-id="${r.id}">Cancel</button>` : `<button class="btn btn-sm" data-act="restoreRecharge" data-id="${r.id}">Restore</button>` },
  ], rows: list });
}

/* ---------- OPERATIONS ---------- */
function viewOps(route) {
  const tab = route.parts[1] || 'today';
  const t = todayStats(), p = podStats();
  const openActs = S().actions.filter(a => a.status === 'open').length;
  let body = tab === 'today' ? opsToday(t) : tab === 'pods' ? opsPods(p) : opsActions();
  const html = pageHead('Operations', 'Today’s plan, proof of delivery, billing readiness and team actions', tab === 'pods' ? `<button class="btn" data-act="exportPods">${icon('download')}Export CSV</button>` : tab === 'actions' && can('act') ? `<button class="btn btn-primary" data-act="raiseAction">${icon('plus')}Raise action</button>` : '') +
    tabs([{ id:'today', label:'Today Board', href:'#/ops/today', count: t.uncovered.length || null }, { id:'pods', label:'PODs & Billing', href:'#/ops/pods', count: p.missing.length || null }, { id:'actions', label:'Actions', href:'#/ops/actions', count: openActs || null }], tab) + body;
  return can('money') ? html : stripMoney(html);
}
function opsToday(t) {
  const exc = t.list.filter(j => ['no_driver','vehicle_unavailable','proposed'].includes(coverState(j)));
  const lanes = [['not_started','Not Started'],['en_route','En Route'],['on_site','On Site'],['delivered','Completed']];
  const ticket = j => `<a class="ticket" href="#/job/${j.id}"><div class="t1"><span>${esc(j.id)}</span><span class="small muted">${esc(j.slot)}</span></div><div class="t2" title="${esc(custName(j.customerId))}">${esc(j.dest)}</div><div class="t3"><span>${j.subcontract ? 'Subcontract' : esc(j.vehicleId)}</span><span>${esc(j.driverId || (j.proposedDriverId ? j.proposedDriverId + ' (proposed)' : j.subcontract ? '' : 'No driver'))}</span>${['confirmed','subcontract'].includes(coverState(j)) ? '' : coverPill(j)}${j.status === 'en_route' && j.eta ? `<span>ETA ${fmtTime(j.eta)}</span>` : ''}${isDone(j) ? (j.pod.status === 'received' ? '<span class="delta-ok">POD received</span>' : '<span class="delta-bad">POD missing</span>') : ''}</div></a>`;
  const order = j => ({ no_driver:0, vehicle_unavailable:0, proposed:1 }[coverState(j)] ?? 2);
  return `<div class="stat-row mb16"><div>${kpiS('Booked', t.booked)}</div><div>${kpiS('Confirmed covered', t.confirmed, 'Vehicle and driver confirmed in Vigo')}</div><div>${kpiS('Planned cover', `${t.planned} / ${t.booked}`, t.proposed.length ? `${t.proposed.length} proposed — awaiting Vigo` : 'No proposals')}</div><div>${kpiS('Uncovered', `<span class="${t.uncovered.length ? 'delta-bad' : ''}">${t.uncovered.length}</span>`)}</div></div>
    ${exc.length ? `<div class="section-title">Needs cover first</div><div class="stack mb16">${exc.sort((a, b) => order(a) - order(b)).map(j => `<div><div class="between mb8"><a class="link strong" href="#/job/${j.id}">${j.id} · ${esc(j.dest)} · ${esc(j.slot)}</a><span class="small muted">${esc(custName(j.customerId))}</span></div>${todayCoverPanel(j).replace('uncovered mt16', 'uncovered')}</div>`).join('')}</div>` : ''}
    <div class="section-title">Job progress <span class="small muted">Updated by driver check-ins</span></div>
    <div class="board">${lanes.map(([s, l]) => { const js = t.list.filter(j => j.status === s).sort((a, b) => order(a) - order(b) || a.slot.localeCompare(b.slot)); return `<div class="lane"><div class="lane-head"><span>${l}</span><span class="muted">${js.length}</span></div>${js.map(ticket).join('') || '<div class="small muted" style="padding:8px">None</div>'}</div>`; }).join('')}</div>
    <div class="caveat mt16">${icon('info')}<div>Vigo remains the operational system of record and is read-only here. Driver proposals are internal planning records and are labelled “awaiting Vigo confirmation” until confirmed in Vigo.</div></div>`;
}
function opsPods(p) {
  const money = can('money');
  const daysSince = j => daysBetween(j.date, TODAY);
  const base = [
    { key:'id', label:'Job', render: j => `<span class="id">${j.id}</span><div class="sub-line">${fmtDate(j.date)}</div>` },
    { key:'cust', label:'Customer', render: j => esc(custName(j.customerId)) },
    { key:'dest', label:'Destination', render: j => esc(j.dest) },
  ];
  const missing = table({ cols:[...base, { key:'age', label:'Days since delivery', num:true, render: j => daysSince(j) }, ...(money ? [{ key:'price', label:'Value', num:true, render: j => gbp(j.price) }] : []), { key:'x', label:'', num:true, render: j => can('pod') ? `<button class="btn btn-sm btn-primary" data-act="uploadPod" data-id="${j.id}">${icon('upload')}Upload POD</button>` : '' }], rows:p.missing, rowAttr: j => `class="clickable" data-act="go" data-href="#/job/${j.id}" tabindex="0"`, empty:'<div class="empty"><h4>All PODs received</h4><p>No delivered job is waiting for proof of delivery.</p></div>' });
  const inv = (list, empty) => table({ cols:[...base, { key:'pod', label:'POD', render: podPill }, ...(money ? [{ key:'price', label:'Value', num:true, render: j => gbp(j.price) }] : [])], rows:list, rowAttr: j => `class="clickable" data-act="go" data-href="#/job/${j.id}" tabindex="0"`, foot: money && list.length ? { id:`<b>${list.length} jobs</b>`, price: gbp(sum(list, j => j.price)) } : null, empty:`<div class="empty small"><p>${empty}</p></div>` });
  const rs = S().recharges, act = activeRecharges();
  const candidates = S().jobs.filter(j => j.recharge && isFlagged(j) && !act.some(r => r.jobId === j.id));
  const recharges = money && can('recharge') || myRole() === 'director' ? `<div class="card mt16" id="recharges"><div class="card-head"><h3>Recharges</h3>${act.length ? `<span class="pill warn">${gbp(sum(act, r => r.amount))} possible recovery — draft only</span>` : ''}</div>
      ${candidates.length ? `<div class="card-pad">${candidates.map(j => `<div class="between" style="padding:6px 0"><div><a class="link strong" href="#/job/${j.id}">${j.id}</a> <span class="text-2">· ${esc(custName(j.customerId))} · ${gbp(j.recharge.amount)} candidate</span><div class="small muted">${esc(j.recharge.basis)}</div></div>${can('recharge') ? `<button class="btn btn-sm btn-primary" data-act="draftRecharge" data-id="${j.id}">Draft ${gbp(j.recharge.amount)}</button>` : ''}</div>`).join('')}</div>` : ''}
      ${rs.length ? rechargeTable(rs) : '<div class="empty small"><p>No recharge drafts yet.</p></div>'}
      <div class="card-pad"><div class="caveat">${icon('info')}<div>Drafts are internal proposals. They do not change revenue, invoiced totals or cash until raised as invoices in Xero.</div></div></div></div>` : '';
  return `<div class="stat-row mb16"><div>${kpiS('Outstanding PODs', p.missing.length)}</div><div>${kpiS('Delivered, not invoiced', p.uninvoiced.length, money ? gbp(sum(p.uninvoiced, j => j.price)) + ' unbilled' : '')}</div><div>${kpiS('Blocked by POD', p.blocked.length)}</div><div>${kpiS('Ready to invoice', p.ready.length)}</div></div>
    <div class="card" id="missing"><div class="card-head"><h3>Missing PODs</h3><span class="small muted">${p.missing.length}</span></div>${missing}</div>
    <div class="grid g2 mt16"><div class="card" id="blocked"><div class="card-head"><h3>Not invoiced — blocked by POD</h3><span class="small muted">${p.blocked.length}</span></div>${inv(p.blocked, 'Nothing blocked.')}</div>
    <div class="card" id="ready"><div class="card-head"><h3>Ready to invoice</h3>${p.ready.length && can('act') ? `<button class="btn btn-sm" data-act="planned" data-arg="xero-invoice">Prepare in Xero</button>` : ''}</div>${inv(p.ready, 'Nothing waiting.')}</div></div>
    ${recharges}`;
}
function opsActions() {
  const f = UI.actionsFilter;
  const list = S().actions.filter(a => f === 'all' || (f === 'open' ? a.status === 'open' : a.status === 'done'));
  return `<div class="card"><div class="filters">${[['open','Open'],['done','Completed'],['all','All']].map(([k, l]) => `<button class="chip ${f === k ? 'active' : ''}" data-act="actFilter" data-arg="${k}">${l}</button>`).join('')}<span class="small muted" style="margin-left:auto">Internal actions — not written to source systems</span></div>${actionsTable(list)}</div>`;
}

/* ---------- CUSTOMERS & CASH ---------- */
const BUCKET_COL = ['#5B6470', '#2F3338', '#B57A16', '#B3141A'];
function viewCash(route) {
  const tab = route.parts[1] || 'debtors';
  const html = pageHead('Customers &amp; Cash', 'Debtor ageing, estimated funding headroom and customer performance', `<button class="btn" data-act="exportInvoices">${icon('download')}Export invoices</button>`) +
    tabs([{ id:'debtors', label:'Debtors & Funding', href:'#/cash/debtors' }, { id:'customers', label:'Customers', href:'#/cash/customers' }, { id:'invoices', label:'Invoices', href:'#/cash/invoices' }], tab);
  if (tab === 'customers') return html + cashCustomers();
  if (tab === 'invoices') return html + cashInvoices();
  const d = debtorStats();
  return html + `<div class="grid g-main"><div class="card card-pad-lg"><div class="between"><div><span class="kpi-label">Total debtors</span><div class="kpi-value">${gbp(d.total)}</div></div><span class="small muted">${d.open.length} open invoices</span></div>
      <div class="stackbar mt16" role="group" aria-label="Debtor ageing">${d.buckets.map((b, i) => `<button style="flex:${b};background:${BUCKET_COL[i]}" data-act="bucket" data-arg="${i}" title="${BUCKETS[i]}: ${gbp(b)}" aria-label="${BUCKETS[i]}: ${gbp(b)}">${gbp(b)}</button>`).join('')}</div>
      <div class="legend">${d.buckets.map((b, i) => `<span><i style="background:${BUCKET_COL[i]}"></i>${BUCKETS[i]} · <b>${gbp(b)}</b> · ${pct(b / d.total * 100, 0)}</span>`).join('')}</div>
      <div class="caveat mt16">${icon('info')}<div>Ageing is calculated from <b>invoice date</b>. Due dates are not in the demo dataset, so balances are not described as overdue. Select a segment to see its invoices.</div></div></div>
    <div class="card card-pad-lg"><span class="kpi-label">Estimated Bibby headroom</span><div class="kpi-value">${gbp(d.headroom)}</div>
      <table class="data mt12"><tbody>
        <tr><td>Eligible receivables</td><td class="num">${gbp(d.eligible)}</td></tr>
        <tr><td>Advance rate</td><td class="num">${d.bibby.advanceRate * 100}%</td></tr>
        <tr><td>Eligible funding value</td><td class="num">${gbp(d.funding)}</td></tr>
        <tr><td>Facility ceiling</td><td class="num">${gbp(d.bibby.facilityCeiling)}</td></tr>
        <tr><td>Amount drawn</td><td class="num">−${gbp(d.bibby.drawn)}</td></tr></tbody>
        <tfoot><tr><td>Estimated available headroom</td><td class="num">${gbp(d.headroom)}</td></tr></tfoot></table>
      <div class="caveat warn mt12">${icon('alert')}<div>Illustrative estimate, subject to Bibby's eligibility and facility rules. ${esc(d.bibby.rule)}</div></div></div></div>
    <div class="card mt16"><div class="card-head"><h3>Excluded from eligible receivables</h3></div>${table({ cols:[{ key:'id', label:'Invoice', render: i => `<a class="link" href="#/invoice/${i.id}">${i.id}</a>` }, { key:'c', label:'Customer', render: i => esc(custName(i.customerId)) }, { key:'r', label:'Reason', render: i => bucketOf(i) === 3 ? 'Over 90 days old' : esc(i.ineligibleReason) }, { key:'a', label:'Amount', num:true, render: i => gbp(i.amount) }], rows: d.open.filter(i => !i.eligible || bucketOf(i) === 3) })}</div>`;
}
function custStats(c) {
  const js = S().jobs.filter(j => j.customerId === c.id && isDone(j) && j.actualCost != null);
  const rev = sum(js, j => j.price), con = sum(js, j => j.price - j.actualCost);
  const open = S().invoices.filter(i => i.customerId === c.id && i.status === 'outstanding');
  const paid = S().paid.filter(p => p.customerId === c.id);
  return { jobs: js, rev, con, margin: rev ? con / rev * 100 : null, open: sum(open, i => i.amount), openList: open, paid, dtp: paid.length ? sum(paid, p => daysBetween(p.invoiceDate, p.paidDate)) / paid.length : null };
}
function cashCustomers() {
  const rows = S().customers.map(c => Object.assign({ c }, custStats(c)));
  return `<div class="card">${table({ cols:[
    { key:'n', label:'Customer', render: r => `<span class="strong">${esc(r.c.name)}</span><div class="sub-line">${esc(r.c.type)} · ${r.c.terms}-day terms</div>` },
    { key:'j', label:'Jobs', num:true, render: r => r.jobs.length },
    { key:'r', label:'Revenue', num:true, render: r => gbp(r.rev) },
    { key:'k', label:'Contribution (modelled)', num:true, render: r => gbp(r.con) },
    { key:'m', label:'Margin', num:true, render: r => pct(r.margin) },
    { key:'o', label:'Open balance', num:true, render: r => gbp(r.open) },
    { key:'d', label:'Avg days to pay', num:true, render: r => r.dtp == null ? '—' : Math.round(r.dtp) + ' days' },
  ], rows, rowAttr: r => `class="clickable" data-act="go" data-href="#/customer/${r.c.id}" tabindex="0"`, foot:{ n:'<b>All customers</b>', j: sum(rows, r => r.jobs.length), r: gbp(sum(rows, r => r.rev)), k: gbp(sum(rows, r => r.con)), m: pct(sum(rows, r => r.con) / sum(rows, r => r.rev) * 100), o: gbp(sum(rows, r => r.open)), d:'' } })}
    <div class="card-pad"><div class="caveat">${icon('info')}<div>Revenue and contribution cover delivered jobs 28 Oct – 4 Nov (4 Nov supplied; earlier days are additional synthetic records). Days to pay uses a small set of <b>additional synthetic paid-invoice records</b> created for this demo — not supplied client data.</div></div></div></div>`;
}
function invoiceRows(list) {
  return table({ cols:[
    { key:'id', label:'Invoice', sort:true, render: i => `<span class="id">${i.id}</span>${i.jobIds ? `<div class="sub-line">${i.jobIds.length} jobs</div>` : ''}` },
    { key:'customer', label:'Customer', sort:true, render: i => esc(custName(i.customerId)) },
    { key:'date', label:'Invoice date', sort:true, render: i => fmtDay(i.date) },
    { key:'age', label:'Age', num:true, sort:true, render: i => daysBetween(i.date, TODAY) + ' days' },
    { key:'bucket', label:'Bucket', render: i => `<span class="pill plain">${BUCKETS[bucketOf(i)]}</span>` },
    { key:'elig', label:'Funding', render: i => i.eligible && bucketOf(i) < 3 ? '<span class="pill ok">Eligible</span>' : '<span class="pill warn">Excluded</span>' },
    { key:'amount', label:'Amount', num:true, sort:true, render: i => gbp(i.amount) },
  ], rows: list, sort: UI.sorts.inv, sortKey:'inv', rowAttr: i => `class="clickable" data-act="go" data-href="#/invoice/${i.id}" tabindex="0"`, foot:{ id:`<b>${list.length} invoices</b>`, amount: `<b>${gbp(sum(list, i => i.amount))}</b>` } });
}
function filteredInvoices() {
  let list = S().invoices.filter(i => i.status === 'outstanding');
  if (UI.invBucket != null) list = list.filter(i => bucketOf(i) === UI.invBucket);
  if (UI.invCustomer) list = list.filter(i => i.customerId === UI.invCustomer);
  return sortRows(list, UI.sorts.inv || { key:'date', dir:'desc' }, { customer: i => custName(i.customerId), age: i => daysBetween(i.date, TODAY) });
}
function cashInvoices() {
  const list = filteredInvoices();
  return `<div class="card"><div class="filters"><button class="chip ${UI.invBucket == null ? 'active' : ''}" data-act="bucket" data-arg="all">All buckets</button>${BUCKETS.map((b, i) => `<button class="chip ${UI.invBucket === i ? 'active' : ''}" data-act="bucket" data-arg="${i}">${b}</button>`).join('')}
    <select class="select" data-act-change="invCustomer" aria-label="Customer"><option value="">All customers</option>${S().customers.map(c => `<option value="${c.id}" ${UI.invCustomer === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <span class="small muted" style="margin-left:auto">Additional synthetic demo invoices</span></div>${invoiceRows(list)}</div>`;
}
function viewCustomer(route) {
  const c = customer(route.parts[1]); if (!c) return `<div class="card empty"><h4>Customer not found</h4></div>`;
  const st = custStats(c), tab = route.q.tab || 'jobs';
  const jobs = S().jobs.filter(j => j.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  let body = '';
  if (tab === 'jobs') { body = `<div class="card">${jobsTable(jobs)}</div>`; UI.jobList = jobs.map(j => j.id); UI.crumb = { label: c.name, href:'#/customer/' + c.id }; }
  if (tab === 'invoices') body = `<div class="card">${invoiceRows(st.openList)}</div>`;
  if (tab === 'contacts') body = `<div class="card">${table({ cols:[{ key:'n', label:'Contact', render: x => `<span class="strong">${esc(x.name)}</span><div class="sub-line">${esc(x.title)}</div>` }, { key:'e', label:'Email', render: x => esc(x.email) }, { key:'s', label:'Shared jobs', num:true, render: x => sharesForContact(x.id).length }, { key:'nt', label:'Notifications', render: x => x.notify ? '<span class="pill ok">On</span>' : '<span class="pill plain">Opted out</span>' }], rows: S().contacts.filter(x => x.customerId === c.id) })}<div class="card-pad small muted">Contacts only see jobs explicitly shared with them. Share from a job's Customer sharing tab.</div></div>`;
  if (tab === 'payments') body = `<div class="card">${table({ cols:[{ key:'id', label:'Payment', render: p => p.id }, { key:'i', label:'Invoice date', render: p => fmtDay(p.invoiceDate) }, { key:'p', label:'Paid', render: p => fmtDay(p.paidDate) }, { key:'d', label:'Days to pay', num:true, render: p => daysBetween(p.invoiceDate, p.paidDate) }, { key:'a', label:'Amount', num:true, render: p => gbp(p.amount) }], rows: st.paid })}<div class="card-pad"><div class="caveat">${icon('info')}<div>Additional synthetic demo data — created to illustrate days-to-pay. In production this comes from Xero payment records.</div></div></div></div>`;
  const all = S().customers.map(x => x.id), i = all.indexOf(c.id);
  return crumbs([{ label:'Customers & Cash', href:'#/cash/customers' }, { label:c.name }]) +
    `<div class="record-head"><div><h1>${esc(c.name)}</h1><div class="meta"><span class="pill plain">${esc(c.type)}</span><span class="pill plain">${c.terms}-day terms</span><span class="pill plain">Fictional customer</span></div></div><div class="pager"><a class="btn btn-sm ${i > 0 ? '' : 'is-disabled'}" ${i > 0 ? `href="#/customer/${all[i - 1]}"` : ''}>${icon('chevL')}Prev</a><a class="btn btn-sm ${i < all.length - 1 ? '' : 'is-disabled'}" ${i < all.length - 1 ? `href="#/customer/${all[i + 1]}"` : ''}>Next${icon('chevR')}</a></div></div>
    <div class="stat-row mb16"><div>${kpiS('Open balance', gbp(st.open), st.openList.length + ' invoices')}</div><div>${kpiS('Revenue', gbp(st.rev), st.jobs.length + ' delivered jobs')}</div><div>${kpiS('Contribution (modelled)', gbp(st.con), pct(st.margin) + ' margin')}</div><div>${kpiS('Avg days to pay', st.dtp == null ? '—' : Math.round(st.dtp) + ' days', 'Synthetic history')}</div></div>` +
    tabs([['jobs','Jobs'],['invoices','Open invoices'],['contacts','Contacts & sharing'],['payments','Payment history']].map(([id, label]) => ({ id, label, href:`#/customer/${c.id}?tab=${id}` })), tab) + body;
}
function viewInvoice(route) {
  const inv = invoice(route.parts[1]); if (!inv) return `<div class="card empty"><h4>Invoice not found</h4></div>`;
  const list = filteredInvoices().map(i => i.id); const ix = list.indexOf(inv.id);
  const js = (inv.jobIds || []).map(job);
  return crumbs([{ label:'Customers & Cash', href:'#/cash/invoices' }, { label:'Invoices', href:'#/cash/invoices' }, { label:inv.id }]) +
    `<div class="record-head"><div><h1>${inv.id}</h1><div class="meta"><span class="pill">Outstanding</span><span class="pill plain">${BUCKETS[bucketOf(inv)]}</span>${inv.eligible && bucketOf(inv) < 3 ? '<span class="pill ok">Funding-eligible</span>' : '<span class="pill warn">Excluded from funding</span>'}<span class="pill plain">Synthetic demo invoice</span></div></div>
    <div class="stack" style="align-items:flex-end;gap:8px">${ix >= 0 ? `<div class="pager"><a class="btn btn-sm ${ix > 0 ? '' : 'is-disabled'}" ${ix > 0 ? `href="#/invoice/${list[ix - 1]}"` : ''}>${icon('chevL')}Prev</a><a class="btn btn-sm ${ix < list.length - 1 ? '' : 'is-disabled'}" ${ix < list.length - 1 ? `href="#/invoice/${list[ix + 1]}"` : ''}>Next${icon('chevR')}</a></div>` : ''}<button class="btn" data-act="planned" data-arg="xero-chase">Chase in Xero</button></div></div>
    <div class="grid g2"><div class="card card-pad"><dl class="kv"><dt>Customer</dt><dd>${recLink('customer', inv.customerId, custName(inv.customerId))}</dd><dt>Invoice date</dt><dd>${fmtDate(inv.date, true)}</dd><dt>Age (by invoice date)</dt><dd>${daysBetween(inv.date, TODAY)} days</dd><dt>Amount (ex VAT)</dt><dd>${gbp(inv.amount)}</dd><dt>Due date</dt><dd class="muted">Not in demo dataset</dd>${inv.ineligibleReason ? `<dt>Funding</dt><dd>${esc(inv.ineligibleReason)}</dd>` : ''}</dl></div>
    <div class="card"><div class="card-head"><h3>Jobs on this invoice</h3></div>${js.length ? table({ cols:[{ key:'id', label:'Job', render: j => `<a class="link" href="#/job/${j.id}">${j.id}</a>` }, { key:'d', label:'Destination', render: j => esc(j.dest) }, { key:'p', label:'Price', num:true, render: j => gbp(j.price) }], rows: js, foot:{ id:'<b>Total</b>', p: gbp(sum(js, j => j.price)) } }) : '<div class="empty small"><p>Job lines for older invoices are not itemised in the demo ledger extract.</p></div>'}</div></div>`;
}

/* ---------- FLEET & COMPLIANCE ---------- */
function fleetMix() { const n = k => S().vehicles.filter(v => v.typeKey === k).length; return [[n('A'), '44t artic'], [n('R26'), '26t rigid'], [n('R18'), '18t rigid']].filter(x => x[0]).map(x => `${x[0]} × ${x[1]}`).join(' · '); }
function viewFleet(route) {
  const tab = route.parts[1] || 'vehicles';
  const nOpen = S().compliance.filter(c => ['overdue','unsigned'].includes(c.status)).length + S().defects.filter(d => d.status !== 'rectified').length;
  const html = pageHead('Fleet &amp; Compliance', 'Vehicles, drivers, compliance follow-ups and policy documents') +
    tabs([{ id:'vehicles', label:'Vehicles', href:'#/fleet/vehicles' }, { id:'drivers', label:'Drivers', href:'#/fleet/drivers' }, { id:'compliance', label:'Compliance', href:'#/fleet/compliance', count: nOpen || null }, { id:'documents', label:'Documents', href:'#/fleet/documents' }], tab);
  let body = tab === 'drivers' ? fleetDrivers() : tab === 'compliance' ? fleetCompliance() : tab === 'documents' ? fleetDocs() : fleetVehicles();
  return stripMoney(html + body);
}
function fleetVehicles() {
  const u = utilisation(); const tr = S().trailers;
  const rows = S().vehicles.map(v => Object.assign({ v }, utilisation(v.id)));
  const today = v => S().jobs.filter(j => j.vehicleId === v.id && j.date === TODAY).map(j => j.id).join(', ') || '—';
  return `<div class="stat-row mb16"><div>${kpiS('HGVs', S().vehicles.length, fleetMix())}</div><div>${kpiS('Trailers', tr.total, `${tr.curtainsider} curtainsider · ${tr.flatbed} flatbed · ${tr.fridge} fridge`)}</div><div>${kpiS('Vehicle-day utilisation', pct(u.util), `${u.worked} of ${u.avail} available vehicle days worked · ${wtdLabel()}`)}</div><div>${kpiS(`Miles · ${wtdLabel()}`, int(u.miles), `${int(u.empty)} empty miles · ${pct(u.emptyPct)} empty running`)}</div></div>
    <div class="card">${table({ cols:[
      { key:'id', label:'Vehicle', render: r => `<span class="id">${r.v.id}</span><div class="sub-line">${r.v.depot}</div>` },
      { key:'t', label:'Type', render: r => r.v.type },
      { key:'s', label:'Status', render: r => { const s = vehicleStatus(r.v); return `<span class="pill ${s.cls}">${s.label}</span>`; } },
      { key:'d', label:'Days worked', num:true, render: r => `${r.worked} / ${r.avail}` },
      { key:'m', label:'Miles', num:true, render: r => int(r.miles) },
      { key:'e', label:'Empty miles', num:true, render: r => int(r.empty) },
      { key:'u', label:'Utilisation', num:true, render: r => r.util == null ? '—' : pct(r.util, 0) },
      { key:'o', label:'Defects / actions', num:true, render: r => { const n = openDefects(r.v.id).length, a = S().actions.filter(x => x.recordId === r.v.id && x.status === 'open').length; return n + a ? `<span class="delta-bad">${n} / ${a}</span>` : '—'; } },
      { key:'j', label:'Today', render: r => esc(today(r.v)) },
    ], rows, rowAttr: r => `class="clickable ${r.v.status === 'vor' ? 'flag' : ''}" data-act="go" data-href="#/vehicle/${r.v.id}" tabindex="0"` })}
    <div class="card-pad small muted">Utilisation = days with at least one delivered job ÷ days the vehicle was available (VOR days excluded). Miles and empty miles are illustrative telematics figures for ${wtdLabel()}.</div></div>`;
}
function licencePill(d) { return { ok:'<span class="pill ok">Current</span>', overdue:'<span class="pill bad">Review overdue</span>', followup:'<span class="pill info">Follow-up recorded</span>', agency:'<span class="pill plain">Agency-held</span>' }[d.licenceStatus] || ''; }
function tachoPill(d) { return { ok:'<span class="pill ok">No open items</span>', unsigned:'<span class="pill warn">Follow-up unsigned</span>', followup:'<span class="pill info">Follow-up recorded</span>' }[d.tachoStatus] || ''; }
const TODAY_STATE = { allocated:'Allocated', available:'Available', proposed:'Proposed (awaiting Vigo)', rest:'Rest day', leave:'Annual leave', not_booked:'Not booked' };
function fleetDrivers() {
  return `<div class="card">${table({ cols:[
    { key:'id', label:'Driver', render: d => `<span class="id">${d.id}</span><div class="sub-line">${esc(d.name)}</div>` },
    { key:'e', label:'Engagement', render: d => esc(d.engagement) },
    { key:'t', label:'Today', render: d => { const j = S().jobs.find(x => x.date === TODAY && (x.driverId === d.id || x.proposedDriverId === d.id)); return `${TODAY_STATE[d.todayState] || '—'}${j ? `<div class="sub-line">${j.id} · ${esc(j.dest)}</div>` : ''}`; } },
    { key:'h', label:'Est. hours available', num:true, render: d => d.hoursAvailMin != null ? hm(d.hoursAvailMin) : '—' },
    { key:'l', label:'Licence evidence', render: licencePill },
    { key:'c', label:'Tachograph', render: tachoPill },
  ], rows: S().drivers, rowAttr: d => `class="clickable ${d.licenceStatus === 'overdue' || d.tachoStatus === 'unsigned' ? 'flag' : ''}" data-act="go" data-href="#/driver/${d.id}" tabindex="0"` })}
  <div class="card-pad"><div class="caveat">${icon('info')}<div>Hours available are <b>illustrative planning estimates</b>, not a legal determination of drivers' hours. Tachomaster and the tachograph record remain the authority.</div></div></div></div>`;
}
function complianceRows() {
  const items = [];
  S().compliance.forEach(c => items.push({ id:c.id, kind:'compliance', title:c.title, rec: c.driverId ? recLink('driver', c.driverId, driverName(c.driverId)) : recLink('vehicle', c.vehicleId), status:c.status, due:c.due, detail:c.detail, source:c.source, c }));
  S().defects.forEach(d => items.push({ id:d.id, kind:'defect', title:`${d.severity === 'safety' ? 'Safety-critical' : 'Minor'} defect — ${d.item}`, rec: recLink('vehicle', d.vehicleId), status:d.status, due:d.reportedAt.slice(0,10), detail:d.note, source:d.source, d }));
  const rank = { overdue:0, vor:1, open:1, unsigned:2, upcoming:3, followup:4, rectified:5 };
  return items.sort((a, b) => rank[a.status] - rank[b.status]);
}
function compStatusPill(s) { return { overdue:'<span class="pill bad">Overdue</span>', unsigned:'<span class="pill warn">Unsigned</span>', upcoming:'<span class="pill plain">Upcoming</span>', followup:'<span class="pill ok">Follow-up recorded</span>', open:'<span class="pill bad">Open</span>', vor:'<span class="pill bad">VOR</span>', rectified:'<span class="pill ok">Rectified</span>' }[s] || s; }
function fleetCompliance() {
  const rows = complianceRows();
  return `<div class="card">${table({ cols:[
    { key:'t', label:'Item', render: r => `<div class="strong">${esc(r.title)}</div><div class="sub-line">${esc(r.detail)}</div>` },
    { key:'r', label:'Record', render: r => r.rec },
    { key:'d', label:'Due / reported', render: r => fmtDate(r.due) },
    { key:'s', label:'Status', render: r => compStatusPill(r.status) },
    { key:'x', label:'', num:true, render: r => !can('compliance') ? '' : r.kind === 'compliance' && r.status !== 'followup' ? `<button class="btn btn-sm btn-primary" data-act="followUp" data-id="${r.id}">Record follow-up</button>` : r.kind === 'defect' && r.status !== 'rectified' ? `<button class="btn btn-sm" data-act="resolveDefect" data-id="${r.id}">Record rectification</button>` : '' },
  ], rows })}
  <div class="card-pad stack" style="gap:8px"><div class="caveat">${icon('info')}<div>Follow-ups recorded here are internal portal records. A licence follow-up is <b>not</b> a DVLA licence check, and a tachograph follow-up is <b>not</b> a sign-off in Tachomaster. External compliance must be verified in the source system.</div></div></div></div>`;
}
function fleetDocs() {
  const q = UI.docQ.toLowerCase(), cat = UI.docCat;
  const cats = uniq(S().documents.map(d => d.category));
  const list = S().documents.filter(d => (!cat || d.category === cat) && (!q || (d.title + d.summary).toLowerCase().includes(q)));
  return `<div class="card"><div class="filters"><div class="f-search">${icon('search')}<input class="input" type="search" placeholder="Search policies and SOPs" value="${esc(UI.docQ)}" data-act-input="docQ" aria-label="Search documents"></div><button class="chip ${!cat ? 'active' : ''}" data-act="docCat" data-arg="">All</button>${cats.map(c => `<button class="chip ${cat === c ? 'active' : ''}" data-act="docCat" data-arg="${c}">${c}</button>`).join('')}</div>
    <div id="doc-list">${docList(list)}</div>
    <div class="card-pad"><div class="caveat">${icon('info')}<div>Illustrative document titles. SharePoint is the <b>proposed</b> source and is not connected. In production the portal reads documents where each haulier already stores them (read-only via Microsoft Graph).</div></div></div></div>`;
}
function docList(list) {
  return table({ cols:[{ key:'t', label:'Document', render: d => `<span class="strong">${esc(d.title)}</span><div class="sub-line">${esc(d.summary.slice(0, 110))}…</div>` }, { key:'c', label:'Category', render: d => `<span class="pill plain">${esc(d.category)}</span>` }, { key:'o', label:'Owner', render: d => esc(d.owner) }, { key:'u', label:'Last updated', render: d => fmtDay(d.updated) }], rows: list, rowAttr: d => `class="clickable" data-act="go" data-href="#/document/${d.id}" tabindex="0"`, empty:'<div class="empty"><h4>No documents match</h4><p>Try another search term or category.</p></div>' });
}
function viewDocument(route) {
  const d = byId(S().documents, route.parts[1]); if (!d) return `<div class="card empty"><h4>Document not found</h4></div>`;
  const rel = d.related.map(id => { const a = byId(S().actions, id), c = byId(S().compliance, id), f = byId(S().defects, id); if (a) return `<li><button class="link" data-act="openAction" data-id="${a.id}">${esc(a.title)}</button> ${a.status === 'open' ? '<span class="pill">Open</span>' : '<span class="pill ok">Completed</span>'}</li>`; if (c) return `<li>${esc(c.title)} · ${c.driverId ? recLink('driver', c.driverId) : recLink('vehicle', c.vehicleId)} ${compStatusPill(c.status)}</li>`; if (f) return `<li>Defect ${f.id} · ${recLink('vehicle', f.vehicleId)} ${compStatusPill(f.status)}</li>`; return ''; }).join('');
  return crumbs([{ label:'Fleet & Compliance', href:'#/fleet/documents' }, { label:'Documents', href:'#/fleet/documents' }, { label:d.title }]) +
    `<div class="record-head"><div><h1>${esc(d.title)}</h1><div class="meta"><span class="pill plain">${esc(d.category)}</span><span class="pill plain">Illustrative document</span></div></div><button class="btn" data-act="planned" data-arg="sharepoint">Open in SharePoint</button></div>
    <div class="grid g-main"><div class="card card-pad-lg"><div class="tag">Preview</div><p class="mt12" style="font-size:15px;line-height:1.65">${esc(d.summary)}</p><p class="small muted mt16">Full document content would be shown from the source library in production.</p></div>
    <div class="stack"><div class="card card-pad"><dl class="kv"><dt>Source</dt><dd>${esc(d.source)}</dd><dt>Owner</dt><dd>${esc(d.owner)}</dd><dt>Last updated</dt><dd>${fmtDay(d.updated)} (seeded)</dd></dl></div>
    <div class="card"><div class="card-head"><h3>Related actions and records</h3></div><div class="card-pad">${rel ? `<ul style="margin:0;padding-left:18px;line-height:2">${rel}</ul>` : '<p class="muted small">None linked.</p>'}</div></div></div></div>`;
}
function viewVehicle(route) {
  const v = vehicle(route.parts[1]); if (!v) return `<div class="card empty"><h4>Vehicle not found</h4></div>`;
  const u = utilisation(v.id), st = vehicleStatus(v), tab = route.q.tab || 'summary';
  const js = S().jobs.filter(j => j.vehicleId === v.id).sort((a, b) => b.date.localeCompare(a.date));
  const defs = S().defects.filter(d => d.vehicleId === v.id);
  const all = S().vehicles.map(x => x.id), i = all.indexOf(v.id);
  const lastW = S().walkarounds.find(w => w.vehicleId === v.id);
  let body = '';
  if (tab === 'summary') body = `<div class="stat-row mb16"><div>${kpiS(`Days worked · ${wtdLabel()}`, `${u.worked} / ${u.avail}`, 'Available vehicle days')}</div><div>${kpiS('Utilisation', u.util == null ? '—' : pct(u.util, 0))}</div><div>${kpiS('Miles', int(u.miles))}</div><div>${kpiS('Empty miles', int(u.empty), u.emptyPct == null ? '' : pct(u.emptyPct) + ' empty running')}</div></div>
    <div class="grid g2"><div class="card card-pad"><dl class="kv"><dt>Type</dt><dd>${v.type}</dd><dt>Base</dt><dd>${v.depot}</dd><dt>Status</dt><dd><span class="pill ${st.cls}">${st.label}</span></dd>${v.status === 'vor' ? `<dt>Off road since</dt><dd>${fmtDate(v.vorSince, true)}</dd><dt>Reason</dt><dd>${esc(v.vorReason)}</dd>` : ''}${v.vorUntil ? `<dt>Returned to service</dt><dd>${fmtDate(v.vorUntil)}</dd>` : ''}<dt>Last walkaround</dt><dd>${lastW ? `${fmtDT(lastW.at)} by ${lastW.driverId} · ${lastW.defects.length ? `${lastW.defects.length} defect(s) — <b>not cleared</b>` : 'no defects'}` : '<span class="muted">Paper record (not digitised)</span>'}</dd>${v.motDue ? `<dt>MOT due</dt><dd>${fmtDay(v.motDue)}</dd>` : ''}</dl></div>
    <div class="card"><div class="card-head"><h3>Defects</h3></div>${defs.length ? table({ cols:[{ key:'i', label:'Defect', render: d => `<span class="strong">${esc(d.item)}</span><div class="sub-line">${esc(d.note)}</div>` }, { key:'s', label:'Severity', render: d => d.severity === 'safety' ? '<span class="pill bad">Safety-critical</span>' : '<span class="pill warn">Minor</span>' }, { key:'st', label:'Status', render: d => compStatusPill(d.status) }, { key:'x', label:'', num:true, render: d => can('compliance') && d.status !== 'rectified' ? `<button class="btn btn-sm" data-act="resolveDefect" data-id="${d.id}">Record rectification</button>` : '' }], rows: defs }) : '<div class="empty small"><p>No defects recorded.</p></div>'}</div></div>`;
  if (tab === 'jobs') body = `<div class="card">${table({ cols:[{ key:'id', label:'Job', render: j => `<span class="id">${j.id}</span>` }, { key:'d', label:'Date', render: j => fmtDate(j.date) }, { key:'de', label:'Destination', render: j => esc(j.dest) }, { key:'dr', label:'Driver', render: j => esc(j.driverId || '—') }, { key:'m', label:'Miles', num:true, render: j => j.actualMiles != null ? int(j.actualMiles) : '—' }, { key:'s', label:'Status', render: deliveryPill }], rows: js, rowAttr: j => `class="clickable" data-act="go" data-href="#/job/${j.id}" tabindex="0"` })}</div>`;
  if (tab === 'history') body = `<div class="grid g2"><div class="card"><div class="card-head"><h3>Actions</h3>${can('act') ? `<button class="btn btn-sm" data-act="raiseAction" data-type="vehicle" data-id="${v.id}">${icon('plus')}Raise action</button>` : ''}</div>${actionsTable(S().actions.filter(a => a.recordId === v.id), true)}</div><div class="card"><div class="card-head"><h3>Activity</h3></div>${activityFeed(30, e => e.recordId === v.id)}</div></div>`;
  return stripMoney(crumbs([{ label:'Fleet & Compliance', href:'#/fleet/vehicles' }, { label:'Vehicles', href:'#/fleet/vehicles' }, { label:v.id }]) +
    `<div class="record-head"><div><h1>${v.id} · ${v.type}</h1><div class="meta"><span class="pill ${st.cls}">${st.label}</span></div></div><div class="stack" style="align-items:flex-end;gap:8px"><div class="pager"><a class="btn btn-sm ${i > 0 ? '' : 'is-disabled'}" ${i > 0 ? `href="#/vehicle/${all[i - 1]}"` : ''}>${icon('chevL')}Prev</a><a class="btn btn-sm ${i < all.length - 1 ? '' : 'is-disabled'}" ${i < all.length - 1 ? `href="#/vehicle/${all[i + 1]}"` : ''}>Next${icon('chevR')}</a></div>${can('act') ? `<button class="btn" data-act="raiseAction" data-type="vehicle" data-id="${v.id}">${icon('plus')}Raise action</button>` : ''}</div></div>` +
    tabs([['summary','Summary'],['jobs','Linked jobs'],['history','Actions & history']].map(([id, label]) => ({ id, label, href:`#/vehicle/${v.id}?tab=${id}`, count: id === 'jobs' ? js.length : null })), tab) + body);
}
function viewDriver(route) {
  const d = driver(route.parts[1]); if (!d) return `<div class="card empty"><h4>Driver not found</h4></div>`;
  const items = S().compliance.filter(c => c.driverId === d.id);
  const js = S().jobs.filter(j => j.driverId === d.id || j.proposedDriverId === d.id || j.plannedDriverId === d.id).sort((a, b) => b.date.localeCompare(a.date));
  const all = S().drivers.map(x => x.id), i = all.indexOf(d.id);
  const open = items.find(c => c.status !== 'followup' && c.status !== 'upcoming');
  const tj = S().jobs.find(x => x.date === TODAY && (x.driverId === d.id || x.proposedDriverId === d.id));
  const compCards = items.length ? items.map(c => `<div class="card card-pad mb12"><div class="between"><div><div class="strong">${esc(c.title)}</div><div class="small text-2 mt8">${esc(c.detail)}</div><div class="small muted mt8">Source: ${esc(c.source)}</div></div>${compStatusPill(c.status)}</div>
      ${c.history.length ? `<ul class="timeline mt12">${c.history.map(h => `<li><span class="dot done"></span><div><div class="strong small">Follow-up recorded by ${esc(user(h.by).name)}</div><div class="small">${esc(h.note)}</div>${h.method ? `<div class="small muted">Method: ${esc(h.method)}</div>` : ''}${h.next ? `<div class="small muted">Next review: ${fmtDay(h.next)}</div>` : ''}</div><span class="small">${fmtDT(h.t)}</span></li>`).join('')}</ul><div class="caveat mt8">${icon('info')}<div>${c.kind === 'licence' ? 'Internal record only — this is not a DVLA licence check.' : c.kind === 'tacho' ? 'Internal record only — not signed off in Tachomaster.' : 'Internal record only.'}</div></div>` : ''}
      ${can('compliance') && c.status !== 'followup' ? `<div class="mt12"><button class="btn ${c.status === 'overdue' || c.status === 'unsigned' ? 'btn-primary' : ''}" data-act="followUp" data-id="${c.id}">Record follow-up</button></div>` : ''}</div>`).join('') : '<div class="card empty small"><p>No open compliance items.</p></div>';
  return stripMoney(crumbs([{ label:'Fleet & Compliance', href:'#/fleet/drivers' }, { label:'Drivers', href:'#/fleet/drivers' }, { label:d.id }]) +
    `<div class="record-head"><div><h1>${d.id} · ${esc(d.name)}</h1><div class="meta"><span class="pill plain">${esc(d.engagement)}</span>${licencePill(d)}${tachoPill(d)}</div></div><div class="stack" style="align-items:flex-end;gap:8px"><div class="pager"><a class="btn btn-sm ${i > 0 ? '' : 'is-disabled'}" ${i > 0 ? `href="#/driver/${all[i - 1]}"` : ''}>${icon('chevL')}Prev</a><a class="btn btn-sm ${i < all.length - 1 ? '' : 'is-disabled'}" ${i < all.length - 1 ? `href="#/driver/${all[i + 1]}"` : ''}>Next${icon('chevR')}</a></div><div class="row">${open && can('compliance') ? `<button class="btn btn-primary" data-act="followUp" data-id="${open.id}">Record follow-up</button>` : ''}${can('act') ? `<button class="btn" data-act="raiseAction" data-type="driver" data-id="${d.id}">${icon('plus')}Raise action</button>` : ''}</div></div></div>
    <div class="grid g-main"><div><div class="section-title">Compliance</div>${compCards}
      <div class="card mt16"><div class="card-head"><h3>Jobs</h3><span class="small muted">${js.length}</span></div>${table({ cols:[{ key:'id', label:'Job', render: j => `<span class="id">${j.id}</span>` }, { key:'d', label:'Date', render: j => fmtDate(j.date) }, { key:'de', label:'Destination', render: j => esc(j.dest) }, { key:'v', label:'Vehicle', render: j => esc(j.vehicleId || '—') }, { key:'s', label:'Status', render: j => j.proposedDriverId === d.id ? '<span class="pill warn">Proposed</span>' : j.plannedDriverId === d.id && j.driverId !== d.id ? '<span class="pill plain">Planned — covered by agency</span>' : deliveryPill(j) }], rows: js, rowAttr: j => `class="clickable" data-act="go" data-href="#/job/${j.id}" tabindex="0"` })}</div></div>
    <div class="stack"><div class="card card-pad"><div class="section-title">Today</div><dl class="kv"><dt>Status</dt><dd>${TODAY_STATE[d.todayState] || '—'}</dd><dt>Job</dt><dd>${tj ? `<a class="link" href="#/job/${tj.id}">${tj.id} · ${esc(tj.dest)}</a>` : '—'}</dd><dt>Est. hours available</dt><dd>${d.hoursAvailMin != null ? hm(d.hoursAvailMin) : '—'}</dd></dl><div class="caveat mt12">${icon('info')}<div>Illustrative planning eligibility only — not a legal determination of drivers' hours.</div></div></div>
    <div class="card"><div class="card-head"><h3>Activity</h3></div>${activityFeed(20, e => e.recordId === d.id)}</div></div></div>`);
}

/* ---------- ADMINISTRATION ---------- */
function viewAdmin(route) {
  const tab = route.parts[1] || 'team';
  const html = pageHead('Administration', 'Team access, source connections, cost model and activity') +
    tabs([{ id:'team', label:'Team & Access', href:'#/admin/team' }, { id:'connections', label:'Connections', href:'#/admin/connections' }, { id:'costmodel', label:'Cost Model', href:'#/admin/costmodel' }, { id:'activity', label:'Activity & Settings', href:'#/admin/activity' }], tab);
  if (tab === 'connections') return html + adminConnections();
  if (tab === 'costmodel') return html + adminCostModel();
  if (tab === 'activity') return html + adminActivity();
  return html + adminTeam();
}
function adminTeam() {
  const staff = S().users.filter(u => u.role !== 'driver' || true);
  const access = u => u.role === 'viewonly' ? `${(u.sections || []).map(s => SECTIONS.find(x => x.id === s).label).join(', ')}${u.money ? ' · financial figures' : ' · no financial figures'}` : u.role === 'driver' ? 'Own assigned jobs only' : sectionsFor(u).map(s => SECTIONS.find(x => x.id === s).label).join(', ');
  return `<div class="between mb12"><p class="text-2">People who can sign in to the Trans Haul portal.</p><button class="btn btn-primary" data-act="invite">${icon('plus')}Invite user</button></div>
    <div class="card">${table({ cols:[
      { key:'n', label:'Name', render: u => `<span class="strong">${esc(u.name)}</span><div class="sub-line">${esc(u.email)}</div>` },
      { key:'r', label:'Role', render: u => esc(ROLE_LABEL[u.role]) },
      { key:'a', label:'Access', render: u => `<span class="small">${esc(access(u))}</span>` },
      { key:'s', label:'Status', render: u => ({ active:'<span class="pill ok">Active</span>', invited:'<span class="pill info">Invited</span>', suspended:'<span class="pill bad">Suspended</span>' })[u.status] },
      { key:'x', label:'', num:true, render: u => u.id === me().id ? '<span class="small muted">You</span>' : u.status === 'suspended' ? `<button class="btn btn-sm" data-act="userStatus" data-id="${u.id}" data-arg="active">Restore</button>` : `<button class="btn btn-sm btn-ghost" data-act="userStatus" data-id="${u.id}" data-arg="suspended">Suspend</button>` },
    ], rows: staff })}</div>
    <div class="caveat mt16">${icon('lock')}<div>In this offline demo, role filtering runs in the browser and is <b>illustrative, not security</b>. The production product enforces roles and tenant isolation on the server (Supabase Auth with Postgres row-level security), so a user can never receive data their role does not permit. Invitations here are simulated — no email is sent. Customer contacts are managed per job, not as staff users.</div></div>`;
}
const CONN_STATE = { 'Access agreed':'ok', 'Proposed':'plain', 'Supplier to confirm':'warn', 'Awaiting access':'info', 'Demo only':'plain' };
function adminConnections() {
  return `<div class="callout good mb16"><div><span class="tag">How the portal fits</span><h3 class="mt8">Each haulier keeps its existing TMS, accounting and compliance systems.</h3><p class="small text-2 mt8">The portal is configured around the systems a haulier already uses. Each haulier authorises its own read-only connections; the portal reads, reconciles and highlights — it does not replace the system of record. Nothing below is connected in this demo.</p></div></div>
    <div class="grid g2">${S().connections.map(c => `<div class="card card-pad"><div class="between"><div><h3 style="font-size:16px">${esc(c.name)}</h3><div class="small text-2">${esc(c.purpose)}</div></div><span class="pill ${CONN_STATE[c.state] || 'plain'}">${esc(c.state)}</span></div>
      <dl class="kv mt12 small"><dt>Proposed method</dt><dd>${esc(c.method)}</dd><dt>Data read</dt><dd>${esc(c.data)}</dd><dt>Source owner</dt><dd>${esc(c.owner)}</dd><dt>Demo status</dt><dd>Demo only — illustrative data, no sync</dd></dl>
      <button class="btn btn-sm mt12" data-act="planned" data-arg="conn-${c.id}">What production needs</button></div>`).join('')}</div>`;
}
function rateRows(r) {
  return [['artic','44t artic', '/mile', r.artic], ['artFuel','Budgeted fuel element in artic rate', '/mile', r.artFuel], ['rigid26','26t rigid', '/mile', r.rigid26], ['rigid18','18t rigid', '/mile', r.rigid18], ['employed','Employed driver', '/hour', r.employed], ['ltd','Limited company driver', '/hour', r.ltd], ['agency','Agency driver', '/hour', r.agency], ['otMult','Employed overtime multiplier', '×', r.otMult], ['pallet','Pallet handling', '/pallet', r.pallet], ['overheadStd','Standard allocated overhead (new costings)', '/job', r.overheadStd]];
}
function adminCostModel() {
  const cur = S().rateCards[S().rateCards.length - 1];
  const flaggedNow = S().jobs.filter(isFlagged);
  return `<div class="grid g-main"><div class="card"><div class="card-head"><h3>Rate card · ${esc(cur.version)}</h3><span class="pill plain">Illustrative rates</span></div>
      <form data-form="rates" class="card-pad"><div class="form-grid">${rateRows(cur.rates).map(([k, l, u, v]) => `<div class="field"><label for="rate-${k}">${l}</label><div class="row" style="flex-wrap:nowrap"><input class="input" id="rate-${k}" name="${k}" type="number" step="0.01" min="0" value="${v}" style="width:120px"><span class="small muted">${u === '×' ? '× standard rate' : '£' + u}</span></div></div>`).join('')}</div>
      <div class="field"><label>Subcontractor cost</label><div class="hint">Taken from the agreed quotation on each job — no rate applies.</div></div>
      <div class="field"><label for="rate-note">Reason for change</label><input class="input" id="rate-note" name="note" placeholder="e.g. Fuel price review November"></div>
      <div class="caveat mb12">${icon('info')}<div>Publishing creates a new version. Completed and already-costed jobs keep the rate snapshot they were costed with, so history never changes silently.</div></div>
      ${can('admin') ? '<button class="btn btn-primary" type="submit">Publish new version</button>' : ''}</form></div>
    <div class="stack"><div class="card card-pad"><div class="section-title">Exception threshold</div><form data-form="threshold"><div class="field"><label for="thr">Flag a job when actual cost exceeds planned cost by more than</label><div class="row" style="flex-wrap:nowrap"><input class="input" id="thr" name="thr" type="number" min="1" max="100" step="0.5" value="${threshold()}" style="width:100px"><span>% of planned cost</span></div><div class="hint">Currently flags ${flaggedNow.length} job${flaggedNow.length === 1 ? '' : 's'}: ${flaggedNow.map(j => j.id).join(', ') || 'none'}.</div></div><button class="btn" type="submit">Apply threshold</button></form></div>
      <div class="card"><div class="card-head"><h3>Version history</h3></div>${table({ cards:false, cols:[{ key:'v', label:'Version', render: r => `<span class="strong">${esc(r.version)}</span><div class="sub-line">${esc(r.note)}</div>` }, { key:'e', label:'Effective', render: r => fmtDT(r.effective) }, { key:'b', label:'By', render: r => esc(user(r.createdBy).name) }], rows: S().rateCards.slice().reverse() })}</div></div></div>`;
}
function adminActivity() {
  const f = UI.actFilter.toLowerCase();
  const list = S().activity.filter(e => !f || [actorLabel(e).name, e.action, e.recordId, e.next].join(' ').toLowerCase().includes(f));
  return `<div class="card"><div class="filters"><div class="f-search">${icon('search')}<input class="input" type="search" placeholder="Filter by person, action or record" value="${esc(UI.actFilter)}" data-act-input="actFilter" aria-label="Filter activity"></div><button class="btn btn-sm" data-act="exportActivity">${icon('download')}Export CSV</button></div>
    <div id="act-list">${activityTable(list)}</div></div>
    <div class="grid g2 mt16"><div class="card card-pad"><div class="section-title">Customer link settings</div><dl class="kv"><dt>One-time link validity</dt><dd>${S().settings.linkHours} hours (demo time)</dd><dt>Link use</dt><dd>Single use, then expires</dd><dt>Delivery notifications</dt><dd>Sent on completion of a shared job (simulated)</dd></dl></div>
    <div class="card card-pad"><div class="section-title">Demo data</div><p class="small text-2">The 4 November job batch, fleet counts and cash figures are the supplied demonstration figures. Earlier-period jobs, invoices and payment history are additional synthetic records. All names, companies and addresses are fictional.</p><button class="btn mt12 demo-only" data-act="resetDemo">${icon('refresh')}Reset demo to initial state</button></div></div>`;
}
function activityTable(list) {
  return table({ cols:[
    { key:'t', label:'Time', render: e => `<span class="nowrap">${fmtDT(e.t)}</span>` },
    { key:'a', label:'Actor', render: e => { const a = actorLabel(e); return `<span class="strong">${esc(a.name)}</span><div class="sub-line">${esc(a.role)}</div>`; } },
    { key:'x', label:'Action', render: e => esc(e.action) },
    { key:'r', label:'Record', render: e => recLinkFor(e) },
    { key:'p', label:'Previous', render: e => `<span class="small">${esc(safeText(e.prev))}</span>` },
    { key:'n', label:'New', render: e => `<span class="small">${esc(safeText(e.next))}</span>` },
  ], rows: list.slice(0, 200) });
}

/* ---------- COST MODEL analysis (Jobs & Margins tab) ---------- */
function viewCostModel() {
  const per = UI.modelPeriod, grp = UI.modelGroup;
  const range = { yesterday:[YESTERDAY, YESTERDAY], wtd:[WEEK_START, YESTERDAY], all:[dataRange()[0], YESTERDAY] }[per];
  const js = S().jobs.filter(j => j.date >= range[0] && j.date <= range[1] && isDone(j) && j.actualCost != null);
  const weekOf = d => 'w/c ' + fmtDay(mondayOf(d));
  const key = { job: j => j.id, customer: j => custName(j.customerId), driver: j => j.driverId || 'Subcontract', vehicle: j => j.vehicleId ? `${j.vehicleId} · ${vehicle(j.vehicleId).type}` : 'Subcontract', week: j => weekOf(j.date) }[grp];
  const groups = {}; js.forEach(j => { const k = key(j); (groups[k] = groups[k] || []).push(j); });
  const rows = Object.entries(groups).map(([k, l]) => { const own = l.filter(j => !j.subcontract); const miles = sum(own, j => j.actualMiles), pal = sum(own, j => j.pallets || 0); const rev = sum(l, j => j.price), pc = sum(l, j => j.plannedCost), ac = sum(l, j => j.actualCost); return { k, l, n:l.length, rev, pc, ac, con: rev - ac, m: rev ? (rev - ac) / rev * 100 : null, cpm: miles ? sum(own, j => j.actualCost) / miles : null, cpp: pal ? sum(own, j => j.actualCost) / pal : null, v: ac - pc }; }).sort((a, b) => b.v - a.v || b.rev - a.rev);
  const cats = {}; js.forEach(j => j.variance.forEach(v => { cats[v.cat] = (cats[v.cat] || 0) + v.amount; }));
  const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]); const cmax = Math.max(1, ...catRows.map(c => Math.abs(c[1])));
  const CAT = { waiting:'Waiting time', mileage:'Mileage & fuel', overtime:'Driver overtime', fuel:'Fuel price', tolls:'Tolls', diversion:'Diversion', agency:'Agency cover' };
  const cur = S().rateCards[S().rateCards.length - 1].rates;
  return pageHead('Jobs &amp; Margins', 'Modelled unit costs and contribution, with drill-down') +
    tabs([{ id:'jobs', label:'Jobs', href:'#/jobs' }, { id:'model', label:'Cost Model', href:'#/jobs/model' }], 'model') +
    `<div class="card"><div class="filters"><span class="small muted">Period</span>${[['yesterday','Yesterday'],['wtd','Week to date'],['all','All records']].map(([k, l]) => `<button class="chip ${per === k ? 'active' : ''}" data-act="modelPeriod" data-arg="${k}">${l}</button>`).join('')}<span class="small muted" style="margin-left:12px">Group by</span>${[['job','Job'],['customer','Customer'],['driver','Driver'],['vehicle','Vehicle'],['week','Week']].map(([k, l]) => `<button class="chip ${grp === k ? 'active' : ''}" data-act="modelGroup" data-arg="${k}">${l}</button>`).join('')}</div>
    ${table({ cols:[
      { key:'k', label: { job:'Job', customer:'Customer', driver:'Driver', vehicle:'Vehicle', week:'Week' }[grp], render: r => `<span class="strong">${esc(r.k)}</span>` },
      { key:'n', label:'Jobs', num:true, render: r => r.n },
      { key:'rev', label:'Revenue', num:true, render: r => gbp(r.rev) },
      { key:'pc', label:'Planned cost', num:true, render: r => gbp(r.pc) },
      { key:'ac', label:'Actual cost', num:true, render: r => gbp(r.ac) },
      { key:'con', label:'Contribution', num:true, render: r => gbp(r.con) },
      { key:'m', label:'Margin', num:true, render: r => pct(r.m) },
      { key:'cpm', label:'Cost / mile', num:true, render: r => r.cpm == null ? '—' : gbp(r.cpm, { pence:true }) },
      { key:'cpp', label:'Cost / pallet', num:true, render: r => r.cpp == null ? '—' : gbp(r.cpp, { pence:true }) },
      { key:'v', label:'Variance', num:true, render: r => `<span class="${r.v > 0 ? 'delta-bad' : ''}">${gbp(r.v, { sign:true })}</span>` },
    ], rows, rowAttr: r => `class="clickable" data-act="drill" data-grp="${grp}" data-key="${esc(grp === 'job' ? r.k : grp === 'customer' ? r.l[0].customerId : grp === 'driver' ? (r.l[0].driverId || '') : grp === 'vehicle' ? (r.l[0].vehicleId || '') : r.l[0].date)}" data-from="${range[0]}" data-to="${range[1]}" tabindex="0"`, foot:{ k:'<b>Total</b>', n: js.length, rev: gbp(sum(js, j => j.price)), pc: gbp(sum(js, j => j.plannedCost)), ac: gbp(sum(js, j => j.actualCost)), con: gbp(sum(js, j => j.price - j.actualCost)), m: pct(sum(js, j => j.price - j.actualCost) / sum(js, j => j.price) * 100), v: gbp(sum(js, j => j.actualCost - j.plannedCost), { sign:true }) } })}
    <div class="card-pad small muted">Select a row to open the matching jobs. Cost per mile and per pallet are fully loaded (total job cost ÷ miles or pallets) for own-fleet jobs; subcontracted jobs are excluded from unit costs.</div></div>
    <div class="grid g2 mt16"><div class="card card-pad"><div class="section-title">Variance by reason</div>${catRows.length ? catRows.map(([c, v]) => `<div class="hbar"><span>${CAT[c] || c}</span><div class="track"><div class="fill ${v < 0 ? 'alt' : ''}" style="width:${Math.abs(v) / cmax * 100}%"></div></div><span class="num" style="text-align:right">${gbp(v, { sign:true })}</span></div>`).join('') : '<p class="muted small">No cost variances in this period.</p>'}</div>
    <div class="card card-pad"><div class="section-title">Rates in use <span class="small muted">${S().rateCards[S().rateCards.length - 1].version}</span></div><dl class="kv small">${rateRows(cur).map(([k, l, u, v]) => `<dt>${l}</dt><dd>${u === '×' ? v + '×' : gbp(v, { pence:true }) + u}</dd>`).join('')}<dt>Subcontractor</dt><dd>Agreed quotation per job</dd><dt>Flag threshold</dt><dd>&gt; ${threshold()}% of planned cost</dd></dl>
    <div class="caveat mt12">${icon('info')}<div><b>Modelled</b> costs are derived from these rates. <b>Verified</b> actual costs would be source-reported (fuel cards, telematics, timesheets) in production; all actuals in this demo are illustrative.</div></div></div></div>`;
}
