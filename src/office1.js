/* ==========================================================================
   OFFICE APP — shell, Overview, Jobs & Margins, Job record
   ========================================================================== */
const UI = {
  jobs: { q:'', from:YESTERDAY, to:YESTERDAY, customer:'', vehicle:'', driver:'', dest:'', exc:'', sort:{ key:'id', dir:'asc' } },
  jobList: [], crumb: null, sorts: {}, actionsFilter:'open', invBucket:null, invCustomer:'', docCat:'', docQ:'', fleetQ:'',
  modelGroup:'customer', modelPeriod:'wtd', actFilter:'', navOpen:false,
};
try { const saved = JSON.parse(sessionStorage.getItem('thp.ui') || 'null'); if (saved) Object.assign(UI.jobs, saved); } catch (e) {}
const saveUI = () => { try { sessionStorage.setItem('thp.ui', JSON.stringify(UI.jobs)); } catch (e) {} };

/* ---------- record links respecting permissions ---------- */
function recLink(type, id, label) {
  label = label == null ? id : label;
  if (!id) return '—';
  const ok = { job: hasSection('jobs') || hasSection('operations'), vehicle: hasSection('fleet'), driver: hasSection('fleet'), customer: can('cash'), invoice: can('cash'), document: hasSection('fleet') }[type];
  return ok ? `<a class="link" href="#/${type}/${encodeURIComponent(id)}">${esc(label)}</a>` : esc(label);
}
const custName = id => (customer(id) || {}).name || '—';

/* ---------- shell ---------- */
function renderOffice(route) {
  const u = me();
  const nav = SECTIONS.filter(s => hasSection(s.id)).map(s => `<a class="nav-item ${route.section === s.id ? 'active' : ''}" href="${s.href}" ${route.section === s.id ? 'aria-current="page"' : ''}>${icon(s.icon)}<span>${s.label}</span></a>`).join('');
  const content = route.view();
  return `<div class="shell ${UI.navOpen ? 'nav-open' : ''}">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand"><span class="brand-flag"></span><div class="brand-mark"><span class="brand-word">TRANS<b> </b>HAUL</span><span class="brand-sub">Haulage Portal</span></div></div>
      <nav class="nav">${nav}</nav>
      <div class="nav-foot">
        <div class="nav-user"><span class="avatar dark">${esc(initials(u.name))}</span><div><div class="who">${esc(u.name)}</div><div class="role">${esc(ROLE_LABEL[u.role])}</div></div></div>
        <div class="row"><button class="btn btn-sm btn-dark" data-act="signOut">${icon('logout')}Sign out</button><button class="btn btn-sm btn-dark" data-act="resetDemo" title="Restore the original demo data">${icon('refresh')}Reset demo</button></div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn btn-ghost btn-sm menu-btn" data-act="toggleNav" aria-label="Open navigation">${icon('menu')}</button>
        <span class="disclosure" title="All data in this demonstration is illustrative. No live systems are connected."><i></i><span>Illustrative demo data<span class="long"> · No live systems connected</span></span></span>
        <span class="clock" title="Fixed demonstration clock — independent of your computer's clock">${icon('clock')} ${fmtDate(nowIso().slice(0,10))} · ${fmtTime(nowIso())} GMT (demo clock)</span>
        <div class="search" role="search">${icon('search')}<input id="gsearch" type="search" placeholder="Search jobs, vehicles, drivers${can('cash') ? ', customers' : ''}" aria-label="Global search" autocomplete="off" data-act-input="gsearch"><div class="search-results" id="gsearch-res" hidden></div></div>
      </header>
      <main class="content" id="content">${content}</main>
    </div>
  </div>`;
}
function denied() { return `<div class="card card-pad-lg empty">${icon('lock')}<h4>This section isn't available for your role</h4><p class="muted">Access is set by the director in Administration.</p><p class="mt16"><a class="btn" href="#/overview">Back to Overview</a></p></div>`; }
function pageHead(title, sub, actions = '') { return `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="page-actions">${actions}</div></div>`; }
function tabs(list, active) { return `<nav class="tabs" role="tablist">${list.map(t => `<a role="tab" class="tab ${t.id === active ? 'active' : ''}" href="${t.href}" aria-selected="${t.id === active}">${esc(t.label)}${t.count != null ? `<span class="count">${t.count}</span>` : ''}</a>`).join('')}</nav>`; }
function crumbs(list) { return `<div class="crumbs">${list.map((c, i) => i < list.length - 1 ? `<a href="${c.href}">${esc(c.label)}</a>${icon('chevR')}` : `<span>${esc(c.label)}</span>`).join('')}</div>`; }

/* ---------- global search ---------- */
function searchAll(q) {
  q = q.trim().toLowerCase(); if (q.length < 2) return [];
  const m = s => String(s || '').toLowerCase().includes(q);
  const groups = [];
  if (hasSection('jobs') || hasSection('operations')) {
    const js = S().jobs.filter(j => m(j.id) || m(custName(j.customerId)) || m(j.dest) || m(j.vehicleId) || m(j.driverId) || m(j.proposedDriverId) || m(j.customerRef)).slice(0, 7);
    if (js.length) groups.push({ label:'Jobs', items: js.map(j => ({ href:'#/job/' + j.id, a: `${j.id} · ${j.dest}`, b: `${custName(j.customerId)} · ${fmtDate(j.date)}` })) });
  }
  if (hasSection('fleet')) {
    const vs = S().vehicles.filter(v => m(v.id) || m(v.type)).slice(0, 5);
    if (vs.length) groups.push({ label:'Vehicles', items: vs.map(v => ({ href:'#/vehicle/' + v.id, a: v.id, b: `${v.type} · ${vehicleStatus(v).label}` })) });
    const ds = S().drivers.filter(d => m(d.id) || m(d.name)).slice(0, 5);
    if (ds.length) groups.push({ label:'Drivers', items: ds.map(d => ({ href:'#/driver/' + d.id, a: `${d.id} · ${d.name}`, b: d.engagement })) });
    const docs = S().documents.filter(d => m(d.title) || m(d.category)).slice(0, 4);
    if (docs.length) groups.push({ label:'Documents', items: docs.map(d => ({ href:'#/document/' + d.id, a: d.title, b: d.category })) });
  }
  if (can('cash')) {
    const cs = S().customers.filter(c => m(c.name) || m(c.type)).slice(0, 4);
    if (cs.length) groups.push({ label:'Customers', items: cs.map(c => ({ href:'#/customer/' + c.id, a: c.name, b: c.type })) });
    const is = S().invoices.filter(i => m(i.id)).slice(0, 4);
    if (is.length) groups.push({ label:'Invoices', items: is.map(i => ({ href:'#/invoice/' + i.id, a: i.id, b: `${custName(i.customerId)} · ${gbp(i.amount)}` })) });
  }
  return groups;
}
function renderSearchResults(q) {
  const box = document.getElementById('gsearch-res'); if (!box) return;
  const g = searchAll(q);
  if (q.trim().length < 2) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = g.length ? g.map(x => `<div class="sr-group">${x.label}</div>` + x.items.map(i => `<a class="sr-item" href="${i.href}"><span class="strong">${esc(i.a)}</span><span class="muted small">${esc(safeText(i.b))}</span></a>`).join('')).join('') : `<div class="empty small"><h4>No results for “${esc(q)}”</h4><p>Search covers what your role can see.</p></div>`;
}

/* ==========================================================================
   OVERVIEW — the five questions
   ========================================================================== */
function attentionItems() {
  const out = [];
  const money = can('money'), fleet = hasSection('fleet') || myRole() === 'transport';
  const y = yesterdayStats();
  if (money) {
    const t1 = job('TH-001');
    if (isFlagged(t1)) {
      const r = activeRecharges().find(x => x.jobId === 'TH-001');
      out.push({ sev:'high', href:'#/job/TH-001', title:`TH-001 · ${gbp(plannedContrib(t1) - actualContrib(t1))} below planned contribution`, detail:`Leeds · waiting ${gbp(150)}, mileage & fuel ${gbp(65)}, overtime ${gbp(55)} · still ${gbp(actualContrib(t1))} contribution-positive`, status: r ? `<span class="pill warn">Recharge draft ${gbp(r.amount)}</span>` : `<span class="pill plain">${gbp(t1.recharge.amount)} recharge candidate</span>` });
    }
    const others = y.flagged.filter(j => j.id !== 'TH-001');
    if (others.length) out.push({ sev:'med', href:'#/jobs', act:'kpiJobs', args:'flagged', title:`${others.map(j => j.id).join(' and ')} above cost threshold`, detail: others.map(j => `${j.id} ${gbp(costVar(j), { sign:true })} (${pct(costVarPct(j))})`).join(' · ') + ` · threshold ${threshold()}%`, status:'' });
  }
  const t = todayStats();
  const t01 = job('TODAY-01'), t02 = job('TODAY-02');
  const c1 = coverState(t01);
  if (c1 === 'no_driver') out.push({ sev:'high', href:'#/job/TODAY-01', title:'TODAY-01 · No driver for Doncaster 10:30', detail:'Vehicle V006 available. D12 is planning-eligible (illustrative).', status:'<span class="pill bad">Uncovered</span>' });
  else if (c1 === 'proposed') out.push({ done:true, href:'#/job/TODAY-01', title:`TODAY-01 · ${t01.proposedDriverId} proposed for Doncaster 10:30`, detail:`Proposed by ${user(t01.proposedBy).name} at ${fmtTime(t01.proposedAt)} · awaiting Vigo confirmation`, status:'<span class="pill warn">Proposed cover</span>' });
  if (coverState(t02) === 'vehicle_unavailable') {
    const esc2 = S().actions.find(a => a.recordId === 'TODAY-02' && a.status === 'open');
    out.push({ sev:'high', href:'#/job/TODAY-02', title:'TODAY-02 · V014 off road — Ipswich 11:15 has no vehicle', detail: esc2 ? `Escalated: ${esc2.title} (owner ${user(esc2.ownerId).name})` : 'No available 26t rigid in the current dataset.', status:'<span class="pill bad">Uncovered</span>' });
  }
  const p = podStats();
  if (p.missing.length) out.push({ sev:'med', href:'#/ops/pods', title:`${p.missing.length} POD${p.missing.length > 1 ? 's' : ''} missing`, detail:`${p.missing.map(j => j.id).join(', ')} · ${p.blocked.length} delivered job${p.blocked.length === 1 ? '' : 's'} blocked from invoicing`, status:'' });
  if (myRole() !== 'operations') {
    S().defects.filter(d => d.status === 'open').forEach(d => out.push({ sev: d.severity === 'safety' ? 'high' : 'med', href:'#/vehicle/' + d.vehicleId, title:`${d.vehicleId} · ${d.severity === 'safety' ? 'Safety-critical' : 'Minor'} defect reported`, detail:`${d.item}${d.note ? ' — ' + d.note : ''} · reported by ${d.reportedBy} at ${fmtTime(d.reportedAt)}`, status: d.severity === 'safety' ? '<span class="pill bad">Not cleared</span>' : '<span class="pill warn">Open</span>' }));
    const v14 = vehicle('V014');
    if (v14.status === 'vor') out.push({ sev:'med', href:'#/vehicle/V014', title:'V014 · Vehicle off road since 3 Nov', detail: v14.vorReason, status:'<span class="pill bad">VOR</span>' });
  }
  if (myRole() !== 'operations') {
    S().compliance.filter(c => c.kind === 'licence' || c.kind === 'tacho').forEach(c => {
      const done = c.status === 'followup';
      out.push({ done, sev: c.status === 'overdue' ? 'high' : 'med', href:'#/driver/' + c.driverId, title:`${c.driverId} · ${c.title}`, detail: done ? `Follow-up recorded by ${user(c.followUpBy).name} at ${fmtTime(c.followUpAt)} · internal record only` : c.detail, status: done ? '<span class="pill ok">Follow-up recorded</span>' : `<span class="pill ${c.status === 'overdue' ? 'bad' : 'warn'}">${statusLabel(c.status)}</span>` });
    });
  }
  if (money && can('recharge') || myRole() === 'director') {
    const rs = activeRecharges();
    if (rs.length) out.push({ done:true, href:'#/ops/pods#recharges', title:`${gbp(sum(rs, r => r.amount))} possible recovery — draft only`, detail: rs.map(r => `${r.jobId} ${gbp(r.amount)}`).join(' · ') + ' · not revenue until invoiced', status:'<span class="pill warn">Draft</span>' });
  }
  return out;
}
function attentionList() {
  const items = attentionItems();
  const open = items.filter(i => !i.done), done = items.filter(i => i.done);
  const row = i => `<a class="att-item" href="${i.href}" ${i.act ? `data-act="${i.act}" data-arg="${i.args}"` : ''}><span class="sev ${i.done ? 'done' : i.sev}"></span><div><div class="att-title">${esc(safeText(i.title))}</div><div class="att-detail">${esc(safeText(i.detail))}</div></div><div>${i.status || icon('chevR')}</div></a>`;
  return `<div class="card"><div class="card-head"><h3>Requires attention</h3><span class="muted small">${open.length} open</span></div><div class="att">${open.length ? open.map(row).join('') : '<div class="empty"><h4>Nothing outstanding</h4><p>All exceptions have been actioned.</p></div>'}${done.length ? `<div class="att-group">Actioned today</div>${done.map(row).join('')}` : ''}</div></div>`;
}
function activityFeed(limit = 8, filter) {
  let list = S().activity; if (filter) list = list.filter(filter);
  if (!filter) list = list.filter(e => e.recordType !== 'export');
  list = list.slice(0, limit);
  return `<div class="feed">${list.length ? list.map(e => { const a = actorLabel(e); return `<div class="feed-item"><span class="avatar">${esc(initials(a.name))}</span><div><div class="small"><span class="strong">${esc(a.name)}</span> <span class="muted">· ${esc(a.role)}</span></div><div>${esc(e.action)} · ${recLinkFor(e)}</div><div class="small text-2">${esc(safeText(e.next))}</div><div class="feed-time">${fmtDT(e.t)}</div></div></div>`; }).join('') : '<div class="empty small"><p>No activity yet.</p></div>'}</div>`;
}
function recLinkFor(e) { return ['job','vehicle','driver','customer','invoice'].includes(e.recordType) ? recLink(e.recordType, e.recordId) : esc(e.recordId); }

function viewOverview() {
  const u = me(), money = can('money'), cash = can('cash'), role = u.role;
  const y = yesterdayStats(), w = wtdStats(), p = podStats(), t = todayStats(), target = S().settings.revenueTarget;
  const canJobs = hasSection('jobs');
  const kl = (href, inner, act, arg) => canJobs || !act ? `<a class="kpi-link" href="${href}" ${act ? `data-act="${act}" data-arg="${arg}"` : ''}>${inner}</a>` : `<div>${inner}</div>`;
  const chipJob = (id, cls, label) => `<a class="chip ${cls}" href="#/job/${id}">${esc(id)}${label ? ' · ' + esc(label) : ''}</a>`;

  // Band 1
  const ach = y.revenue / target * 100;
  const b1 = `<section class="band" aria-labelledby="q1"><div class="band-q"><span class="qn">1</span><h2 id="q1">What happened yesterday?</h2><span class="when">${fmtDate(YESTERDAY, true)}</span></div><div class="band-body">
    <div class="band-cell">${kl('#/jobs', `<div class="kpi"><span class="kpi-label">Jobs delivered</span><span class="kpi-value">${y.jobs}</span><span class="kpi-meta">All booked jobs completed</span></div>`, 'kpiJobs', 'yesterday')}</div>
    <div class="band-cell">${kl('#/jobs', `<div class="kpi"><span class="kpi-label">On time</span><span class="kpi-value">${y.onTime.length} <span class="muted" style="font-size:16px;font-weight:600">· ${pct(y.onTime.length / y.jobs * 100, 0)}</span></span><span class="kpi-meta">${y.late.length} late against booked slot</span></div>`, 'kpiJobs', 'yesterday')}</div>
    <div class="band-cell"><div class="kpi">${kl('#/jobs', `<span class="kpi-label">Late deliveries</span><span class="kpi-value">${y.late.length}</span>`, 'kpiJobs', 'late')}<div class="chips">${y.late.map(j => chipJob(j.id, 'warn', j.dest)).join('')}</div></div></div>
    ${money ? `<div class="band-cell wide">${kl('#/jobs', `<div class="kpi"><span class="kpi-label">Revenue against ${gbp(target)} daily target</span><span class="kpi-value">${gbp(y.revenue)} <span class="muted" style="font-size:15px;font-weight:600">${pct(ach)} of target</span></span><div class="meter target" aria-label="${pct(ach)} of target"><span style="width:${Math.min(100, ach)}%"></span></div><span class="kpi-meta"><span class="delta-bad">${gbp(target - y.revenue)} short</span> of target</span></div>`, 'kpiJobs', 'revenue')}</div>` : ''}
  </div></section>`;

  // Band 2
  const mx = Math.max(y.planned, y.actual), mw = Math.max(w.planned, w.actual);
  const rs = activeRecharges(), rsum = sum(rs, r => r.amount);
  const b2 = money ? `<section class="band" aria-labelledby="q2"><div class="band-q"><span class="qn">2</span><h2 id="q2">What did those jobs cost?</h2><span class="when">Planned vs actual</span></div><div class="band-body">
    <div class="band-cell">${kl('#/jobs', `<div class="kpi"><span class="kpi-label">Actual cost yesterday</span><span class="kpi-value">${gbp(y.actual)}</span><div class="cmp"><span class="lbl">Planned</span><span class="bar" style="width:${y.planned / mx * 100}%"></span><span class="num">${gbp(y.planned)}</span><span class="lbl">Actual</span><span class="bar actual" style="width:${y.actual / mx * 100}%"></span><span class="num">${gbp(y.actual)}</span></div><span class="kpi-meta"><span class="delta-bad">${gbp(y.overrun, { sign:true })}</span> over plan</span></div>`, 'kpiJobs', 'yesterday')}</div>
    <div class="band-cell">${kl('#/jobs', `<div class="kpi"><span class="kpi-label">Contribution yesterday</span><span class="kpi-value">${gbp(y.aContrib)}</span><span class="kpi-meta">Planned ${gbp(y.pContrib)} · <span class="delta-bad">${gbp(y.aContrib - y.pContrib)}</span></span><span class="kpi-meta">Margin ${pct(y.aMargin, 2)} vs ${pct(y.pMargin, 2)} planned</span></div>`, 'kpiJobs', 'yesterday')}</div>
    <div class="band-cell"><div class="kpi">${kl('#/jobs', `<span class="kpi-label">Jobs over cost threshold (&gt;${threshold()}%)</span><span class="kpi-value">${y.flagged.length}</span>`, 'kpiJobs', 'flagged')}<div class="chips">${y.flagged.map(j => chipJob(j.id, 'bad', gbp(costVar(j), { sign:true }))).join('')}</div></div></div>
    <div class="band-cell">${kl('#/ops/pods#recharges', `<div class="kpi"><span class="kpi-label">Recharge recovery</span>${rs.length ? `<span class="kpi-value sm">${gbp(rsum)}</span><span class="kpi-meta">possible recovery — <b>draft only</b></span><span class="kpi-meta muted">${rs.map(r => r.jobId).join(', ')} · not revenue</span>` : `<span class="kpi-value sm muted">No drafts</span><span class="kpi-meta">${S().jobs.filter(j => j.recharge && isFlagged(j)).length} recharge candidates identified</span>`}</div>`)}</div>
    <div class="band-cell">${kl('#/jobs', `<div class="kpi"><span class="kpi-label">Week to date cost · Mon 2 – Wed 4 Nov</span><span class="kpi-value sm">${gbp(w.actual)}</span><div class="cmp"><span class="lbl">Planned</span><span class="bar" style="width:${w.planned / mw * 100}%"></span><span class="num">${gbp(w.planned)}</span><span class="lbl">Actual</span><span class="bar actual" style="width:${w.actual / mw * 100}%"></span><span class="num">${gbp(w.actual)}</span></div><span class="kpi-meta"><span class="delta-bad">${gbp(w.actual - w.planned, { sign:true })}</span> over plan</span></div>`, 'kpiJobs', 'wtd')}</div>
  </div></section>` : '';

  // Band 3
  const unbilled = sum(p.uninvoiced, j => j.price);
  const b3 = `<section class="band" aria-labelledby="q3"><div class="band-q"><span class="qn">3</span><h2 id="q3">Which PODs are missing and what isn't invoiced?</h2><span class="when">All delivered jobs</span></div><div class="band-body">
    <div class="band-cell"><a class="kpi-link" href="#/ops/pods"><div class="kpi"><span class="kpi-label">Outstanding PODs</span><span class="kpi-value">${p.missing.length}</span><span class="kpi-meta">${p.missing.map(j => j.id).join(', ') || 'None'}</span></div></a></div>
    <div class="band-cell"><a class="kpi-link" href="#/ops/pods"><div class="kpi"><span class="kpi-label">Delivered, not invoiced</span><span class="kpi-value">${p.uninvoiced.length}</span>${money ? `<span class="kpi-meta">${gbp(unbilled)} unbilled</span>` : '<span class="kpi-meta">Awaiting invoice in Xero</span>'}</div></a></div>
    <div class="band-cell"><a class="kpi-link" href="#/ops/pods#blocked"><div class="kpi"><span class="kpi-label">Blocked by missing POD</span><span class="kpi-value">${p.blocked.length}</span><span class="kpi-meta">Cannot invoice yet</span></div></a></div>
    <div class="band-cell"><a class="kpi-link" href="#/ops/pods#ready"><div class="kpi"><span class="kpi-label">Ready to invoice</span><span class="kpi-value">${p.ready.length}</span><span class="kpi-meta">${p.ready.map(j => j.id).join(', ') || 'None'}</span></div></a></div>
  </div></section>`;

  // Band 4
  let b4 = '';
  if (cash) {
    const d = debtorStats();
    const cols = ['#5B6470', '#2F3338', '#B57A16', '#B3141A'];
    b4 = `<section class="band" aria-labelledby="q4"><div class="band-q"><span class="qn">4</span><h2 id="q4">What's the cash position?</h2><span class="when">Aged by invoice date</span></div><div class="band-body">
      <div class="band-cell wide"><a class="kpi-link" href="#/cash/debtors"><div class="kpi"><span class="kpi-label">Total debtors</span><span class="kpi-value">${gbp(d.total)}</span><div class="stackbar" style="height:10px;margin-top:6px" aria-hidden="true">${d.buckets.map((b, i) => `<span style="flex:${b};background:${cols[i]}"></span>`).join('')}</div><span class="kpi-meta">${d.buckets.map((b, i) => `${BUCKETS[i].replace(' days','d')} ${gbp(b)}`).join(' · ')}</span></div></a></div>
      <div class="band-cell"><a class="kpi-link" href="#/cash/debtors"><div class="kpi"><span class="kpi-label">Estimated Bibby headroom</span><span class="kpi-value">${gbp(d.headroom)}</span><span class="kpi-meta">Illustrative estimate</span></div></a></div>
      <div class="band-cell"><a class="kpi-link" href="#/cash/debtors"><div class="kpi"><span class="kpi-label">Funding calculation</span><span class="kpi-meta">${gbp(d.eligible)} eligible × ${d.bibby.advanceRate * 100}% = ${gbp(d.funding)}</span><span class="kpi-meta">less ${gbp(d.bibby.drawn)} drawn</span></div></a></div>
    </div></section>`;
  }

  // Band 5
  const prog = s => t.list.filter(j => j.status === s).length;
  const b5 = `<section class="band" aria-labelledby="q5"><div class="band-q"><span class="qn">${cash ? 5 : money ? 4 : 3}</span><h2 id="q5">What's happening today?</h2><span class="when">${fmtDate(TODAY, true)}</span></div><div class="band-body">
    <div class="band-cell"><a class="kpi-link" href="#/ops/today"><div class="kpi"><span class="kpi-label">Booked jobs</span><span class="kpi-value">${t.booked}</span><span class="kpi-meta">${prog('en_route')} en route · ${prog('on_site')} on site · ${prog('delivered')} completed</span></div></a></div>
    <div class="band-cell"><a class="kpi-link" href="#/ops/today"><div class="kpi"><span class="kpi-label">Covered — vehicle and driver</span><span class="kpi-value">${t.planned}<span class="muted" style="font-size:16px"> / ${t.booked}</span></span><span class="kpi-meta">${t.confirmed} confirmed in Vigo${t.proposed.length ? ` · <span class="delta-warn">${t.proposed.length} proposed</span>` : ''}</span></div></a></div>
    <div class="band-cell wide"><div class="kpi"><a class="kpi-link" href="#/ops/today"><span class="kpi-label">Uncovered</span><span class="kpi-value ${t.uncovered.length ? '' : 'muted'}">${t.uncovered.length}</span></a><div class="chips">${t.uncovered.map(j => chipJob(j.id, 'bad', coverState(j) === 'no_driver' ? 'No driver' : 'Vehicle VOR')).join('')}${t.proposed.map(j => chipJob(j.id, 'warn', j.proposedDriverId + ' proposed')).join('')}</div></div></div>
  </div></section>`;

  const greet = role === 'director' ? 'Good morning, Paul' : `Good morning, ${u.name.split(' ')[0] === 'Transport' ? 'Transport team' : u.name.split(' ')[0]}`;
  return pageHead(greet, `${fmtDate(TODAY, true)} · morning position at 07:00`, `<button class="btn" data-act="printReport">${icon('print')}Print report</button>`) +
    `<div class="bands">${b1}${b2}${b3}${b4}${b5}</div>
    <div class="grid g-main mt24">${attentionList()}<div class="card"><div class="card-head"><h3>Recent activity</h3>${hasSection('admin') ? '<a class="link small" href="#/admin/activity">Full log</a>' : ''}</div>${activityFeed(8)}</div></div>`;
}

/* ==========================================================================
   JOBS & MARGINS
   ========================================================================== */
const SEED_RANGE = ['2026-10-28', '2026-11-05'];
function filteredJobs() {
  const f = UI.jobs; const q = f.q.trim().toLowerCase();
  let list = S().jobs.filter(j => (!f.from || j.date >= f.from) && (!f.to || j.date <= f.to));
  if (q) list = list.filter(j => [j.id, custName(j.customerId), j.dest, j.vehicleId, j.driverId, j.proposedDriverId, j.customerRef].some(x => String(x || '').toLowerCase().includes(q)));
  if (f.customer) list = list.filter(j => j.customerId === f.customer);
  if (f.vehicle) list = list.filter(j => j.vehicleId === f.vehicle);
  if (f.driver) list = list.filter(j => j.driverId === f.driver || j.proposedDriverId === f.driver);
  if (f.dest) list = list.filter(j => j.dest === f.dest);
  const ex = { flagged: isFlagged, late: j => isDone(j) && j.late, ontime: j => isDone(j) && !j.late, pod: j => j.pod.status === 'missing', uninv: j => j.invoice.status === 'pending', ready: j => j.invoice.status === 'pending' && j.pod.status === 'received', recharge: j => j.recharge && isFlagged(j), uncovered: j => j.date === TODAY && ['no_driver','vehicle_unavailable'].includes(coverState(j)) };
  if (f.exc && ex[f.exc]) list = list.filter(ex[f.exc]);
  const g = { id: j => j.date + j.id, customer: j => custName(j.customerId), dest: j => j.dest, price: j => j.price, planned: j => j.plannedCost, actual: j => j.actualCost, contrib: j => actualContrib(j), variance: j => costVarPct(j), status: j => j.status + (j.late ? 1 : 0), date: j => j.date };
  return sortRows(list, f.sort, g);
}
function setJobFilter(preset) {
  const f = UI.jobs; Object.assign(f, { q:'', customer:'', vehicle:'', driver:'', dest:'', exc:'' });
  if (preset === 'yesterday' || preset === 'revenue') Object.assign(f, { from:YESTERDAY, to:YESTERDAY, sort: preset === 'revenue' ? { key:'price', dir:'desc' } : { key:'id', dir:'asc' } });
  if (preset === 'late') Object.assign(f, { from:YESTERDAY, to:YESTERDAY, exc:'late' });
  if (preset === 'flagged') Object.assign(f, { from:YESTERDAY, to:YESTERDAY, exc:'flagged', sort:{ key:'variance', dir:'desc' } });
  if (preset === 'wtd') Object.assign(f, { from:WEEK_START, to:YESTERDAY, sort:{ key:'id', dir:'asc' } });
  if (preset === 'all') Object.assign(f, { from:SEED_RANGE[0], to:SEED_RANGE[1] });
  if (preset === 'today') Object.assign(f, { from:TODAY, to:TODAY });
  saveUI();
}
function jobsSummary(list) {
  const done = list.filter(j => isDone(j) && j.actualCost != null);
  const money = can('money');
  const rev = sum(done, j => j.price), pl = sum(done, j => j.plannedCost), ac = sum(done, j => j.actualCost);
  const booked = list.filter(j => !isDone(j));
  const k = (l, v, m) => `<div class="kpi"><span class="kpi-label">${l}</span><span class="kpi-value">${v}</span>${m ? `<span class="kpi-meta">${m}</span>` : ''}</div>`;
  if (!money) return `<div class="filter-summary">${k('Jobs', list.length, `${done.length} delivered · ${booked.length} booked`)}${k('Late', done.filter(j => j.late).length)}${k('Missing PODs', list.filter(j => j.pod.status === 'missing').length)}</div>`;
  return `<div class="filter-summary">${k('Jobs', list.length, `${done.length} delivered${booked.length ? ` · ${booked.length} booked` : ''}`)}${k('Revenue (delivered)', gbp(rev))}${k('Planned cost', gbp(pl))}${k('Actual cost', gbp(ac), `<span class="${ac > pl ? 'delta-bad' : 'delta-ok'}">${gbp(ac - pl, { sign:true })}</span> vs plan`)}${k('Contribution', gbp(rev - ac), `Planned ${gbp(rev - pl)}`)}${k('Margin', rev ? pct((rev - ac) / rev * 100, 2) : '—', rev ? `Planned ${pct((rev - pl) / rev * 100, 2)}` : '')}</div>`;
}
function jobsTable(list) {
  const money = can('money');
  const vcell = j => { const v = costVar(j); if (v == null) return '<span class="muted">—</span>'; const p = costVarPct(j); return `<span class="${isFlagged(j) ? 'delta-bad' : v > 0 ? '' : 'muted'}">${gbp(v, { sign:true })}</span><div class="sub-line">${p > 0 ? '+' : ''}${pct(p)}</div>`; };
  const cols = money ? [
    { key:'id', label:'Job', sort:true, render: j => `<span class="id">${esc(j.id)}</span><div class="sub-line">${fmtDate(j.date)}${j.src === 'synthetic' && j.date < YESTERDAY ? ' · synthetic' : ''}</div>` },
    { key:'customer', label:'Customer', sort:true, render: j => esc(custName(j.customerId)) },
    { key:'dest', label:'Destination', sort:true, render: j => esc(j.dest) },
    { key:'price', label:'Price', num:true, sort:true, render: j => gbp(j.price) },
    { key:'planned', label:'Planned Cost', num:true, sort:true, render: j => gbp(j.plannedCost) },
    { key:'actual', label:'Actual Cost', num:true, sort:true, render: j => j.actualCost == null ? '<span class="muted">Pending</span>' : gbp(j.actualCost) },
    { key:'contrib', label:'Contribution', num:true, sort:true, render: j => j.actualCost == null ? `<span class="muted">${gbp(plannedContrib(j))} planned</span>` : gbp(actualContrib(j)) },
    { key:'variance', label:'Cost Variance', num:true, sort:true, render: vcell },
    { key:'status', label:'Delivery Status', sort:true, render: deliveryPill },
  ] : [
    { key:'id', label:'Job', sort:true, render: j => `<span class="id">${esc(j.id)}</span><div class="sub-line">${fmtDate(j.date)}</div>` },
    { key:'customer', label:'Customer', sort:true, render: j => esc(custName(j.customerId)) },
    { key:'dest', label:'Destination', sort:true, render: j => esc(j.dest) },
    { key:'veh', label:'Vehicle', render: j => esc(j.vehicleId || 'Subcontract') },
    { key:'drv', label:'Driver', render: j => esc(j.driverId || j.proposedDriverId || '—') },
    { key:'status', label:'Delivery Status', sort:true, render: deliveryPill },
    { key:'pod', label:'POD', render: podPill },
  ];
  const done = list.filter(j => isDone(j) && j.actualCost != null);
  const foot = money && list.length ? { id: `<span class="strong">Total · ${list.length} jobs</span>`, price: gbp(sum(list, j => j.price)), planned: gbp(sum(list, j => j.plannedCost)), actual: gbp(sum(done, j => j.actualCost)), contrib: gbp(sum(done, j => j.price - j.actualCost)), variance: gbp(sum(done, j => j.actualCost - j.plannedCost), { sign:true }) } : null;
  const f = UI.jobs;
  const empty = `<div class="empty"><h4>No jobs match these filters</h4><p>${f.from && f.to ? `Nothing between ${fmtDay(f.from)} and ${fmtDay(f.to)}. ` : ''}Seeded demo data covers 28 Oct – 5 Nov 2026.</p><p class="mt12"><button class="btn btn-sm" data-act="kpiJobs" data-arg="all">Show all seeded jobs</button></p></div>`;
  return table({ cols, rows: list, foot, sort: UI.jobs.sort, sortKey:'jobs', empty, rowAttr: j => `class="clickable ${isFlagged(j) ? 'flag' : ''}" data-act="go" data-href="#/job/${j.id}" tabindex="0"` });
}
function renderJobsResults() {
  const list = filteredJobs(); UI.jobList = list.map(j => j.id);
  const el = document.getElementById('jobs-results');
  const html = jobsSummary(list) + jobsTable(list);
  if (el) el.innerHTML = can('money') ? html : stripMoney(html);
  const sel = document.getElementById('jobs-sort'); if (sel) sel.value = UI.jobs.sort.key + ':' + UI.jobs.sort.dir;
}
function viewJobs(route) {
  if (route.parts[1] === 'model') return viewCostModel();
  const f = UI.jobs; const money = can('money');
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  const dests = uniq(S().jobs.map(j => j.dest)).sort();
  const presets = [['yesterday','Yesterday'],['wtd','Week to date'],['today','Today'],['all','All seeded']];
  const activePreset = f.from === YESTERDAY && f.to === YESTERDAY ? 'yesterday' : f.from === WEEK_START && f.to === YESTERDAY ? 'wtd' : f.from === TODAY && f.to === TODAY ? 'today' : f.from === SEED_RANGE[0] && f.to === SEED_RANGE[1] ? 'all' : '';
  const html = pageHead('Jobs &amp; Margins', 'Where revenue is earned, where contribution is eroding, and why', `<button class="btn" data-act="exportJobs">${icon('download')}Export CSV</button>`) +
    tabs([{ id:'jobs', label:'Jobs', href:'#/jobs' }, ...(money ? [{ id:'model', label:'Cost Model', href:'#/jobs/model' }] : [])], 'jobs') +
    `<div class="card">
      <div class="filters">
        <div class="f-search">${icon('search')}<input class="input" type="search" placeholder="Search job, customer, destination, vehicle or driver" value="${esc(f.q)}" data-bind="q" aria-label="Search jobs"></div>
        <div class="row">${presets.map(([k, l]) => `<button class="chip ${activePreset === k ? 'active' : ''}" data-act="kpiJobs" data-arg="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="filters">
        <label class="f-date small muted">From <input class="input" type="date" value="${esc(f.from)}" data-bind="from" aria-label="From date"></label>
        <label class="f-date small muted">To <input class="input" type="date" value="${esc(f.to)}" data-bind="to" aria-label="To date"></label>
        <select class="select" data-bind="customer" aria-label="Customer">${opt('', 'All customers', f.customer)}${S().customers.map(c => opt(c.id, c.name, f.customer)).join('')}</select>
        <select class="select" data-bind="vehicle" aria-label="Vehicle">${opt('', 'All vehicles', f.vehicle)}${S().vehicles.map(v => opt(v.id, v.id + ' · ' + v.type, f.vehicle)).join('')}</select>
        <select class="select" data-bind="driver" aria-label="Driver">${opt('', 'All drivers', f.driver)}${S().drivers.map(d => opt(d.id, d.id + ' · ' + d.name, f.driver)).join('')}</select>
        <select class="select" data-bind="dest" aria-label="Destination">${opt('', 'All destinations', f.dest)}${dests.map(d => opt(d, d, f.dest)).join('')}</select>
        <select class="select" data-bind="exc" aria-label="Exception">${opt('', 'All jobs', f.exc)}${money ? opt('flagged', `Over cost threshold (>${threshold()}%)`, f.exc) : ''}${opt('late', 'Late deliveries', f.exc)}${opt('ontime', 'On time', f.exc)}${opt('pod', 'Missing POD', f.exc)}${opt('uninv', 'Delivered, not invoiced', f.exc)}${opt('ready', 'Ready to invoice', f.exc)}${money ? opt('recharge', 'Recharge candidates', f.exc) : ''}${opt('uncovered', 'Uncovered today', f.exc)}</select>
        <select class="select" id="jobs-sort" data-bind="sort" aria-label="Sort">${[['id:asc','Sort: Job number'],['date:desc','Sort: Newest first'],['customer:asc','Sort: Customer'],['dest:asc','Sort: Destination'], ...(money ? [['price:desc','Sort: Price (high–low)'],['variance:desc','Sort: Cost variance (high–low)'],['contrib:asc','Sort: Contribution (low–high)']] : []),['status:asc','Sort: Delivery status']].map(([v, l]) => opt(v, l, f.sort.key + ':' + f.sort.dir)).join('')}</select>
        <button class="btn btn-sm btn-ghost" data-act="kpiJobs" data-arg="clear">Clear filters</button>
      </div>
      ${money ? `<div class="filters small muted" style="padding:8px 16px">${icon('info')} Flag rule: actual cost more than <b>&nbsp;${threshold()}%&nbsp;</b> above planned cost${can('admin') ? ' · <a class="link" href="#/admin/costmodel">change in Administration</a>' : ' · set by the director'}. Earlier-period jobs are additional synthetic demo records.</div>` : ''}
      <div id="jobs-results"></div>
    </div>`;
  setTimeout(renderJobsResults, 0);
  return html;
}

/* ---------- cost lines & job detail ---------- */
function rateFor(j) { const v = vehicle(j.vehicleId); return v ? { A:1.65, R26:1.30, R18:1.05 }[v.typeKey] : null; }
function costLines(j) {
  if (j.subcontract) { const l = [{ k:'sub', label:`Subcontractor — agreed quotation (${j.subcontractor})`, amt:j.plannedCost }]; return { planned:l, actual: j.actualCost != null ? l : null }; }
  if (j.miles == null) return null;
  const rate = rateFor(j), pd = driver(j.plannedDriverId || j.driverId), drate = pd ? pd.rate : 19;
  const vt = vehicle(j.vehicleId).type;
  if (j.id === 'TH-001') return {
    planned: [ { k:'mileage', label:'Vehicle running — 330 miles × £1.65/mile (44t artic rate)', amt:544.50 }, { k:'driver', label:'Driver time — 9 hours × £19/hour (employed)', amt:171 }, { k:'pallet', label:'Pallet handling — 26 pallets × £5.50', amt:143 }, { k:'overhead', label:'Allocated overhead (modelled)', amt:61.50 } ],
    actual: [ { k:'mileage', label:'Vehicle running — 369 miles × £1.65/mile', amt:608.85 }, { k:'fuel', label:'Additional fuel adjustment (reconciles to reported actual)', amt:0.65 }, { k:'driver', label:'Driver time incl. overtime — 9h at £19 + 1h56m at £28.50 (1.5×)', amt:226 }, { k:'waiting', label:'Waiting time at customer', amt:150 }, { k:'pallet', label:'Pallet handling — 26 pallets × £5.50', amt:143 }, { k:'overhead', label:'Allocated overhead (modelled)', amt:61.50 } ],
  };
  const planned = [
    { k:'mileage', label:`Vehicle running — ${j.miles} miles × ${gbp(rate, { pence:true })}/mile (${vt})`, amt: r2(j.miles * rate) },
    { k:'driver', label:`Driver time — ${j.hours} hours × £${drate}/hour (${pd ? pd.engagement.toLowerCase() : 'employed'})`, amt: r2(j.hours * drate) },
    { k:'pallet', label:`Pallet handling — ${j.pallets} pallets × £5.50`, amt: r2(j.pallets * 5.5) },
    { k:'overhead', label:'Allocated overhead & other modelled costs', amt: j.overhead },
  ];
  const actual = j.actualCost == null ? null : planned.concat(j.variance.map(v => ({ k:v.cat, label:v.reason, amt:v.amount, variance:true })));
  return { planned, actual };
}
function bridge(j) {
  const pc = plannedContrib(j), ac = actualContrib(j);
  const max = Math.max(pc, ac, 1); let run = pc;
  const rows = [`<div class="bridge-row"><span>Planned contribution</span><div class="bridge-track"><span class="bridge-bar base" style="left:0;width:${pc / max * 100}%"></span></div><span class="num">${gbp(pc)}</span></div>`];
  j.variance.forEach(v => { const from = run - v.amount; rows.push(`<div class="bridge-row"><span>${esc(v.reason.replace(/\s*\(.*\)/, ''))}</span><div class="bridge-track"><span class="bridge-bar neg" style="left:${Math.min(from, run) / max * 100}%;width:${Math.abs(v.amount) / max * 100}%"></span></div><span class="num delta-bad">${gbp(-v.amount)}</span></div>`); run = from; });
  rows.push(`<div class="bridge-row"><span class="strong">Actual contribution</span><div class="bridge-track"><span class="bridge-bar end" style="left:0;width:${ac / max * 100}%"></span></div><span class="num">${gbp(ac)}</span></div>`);
  return `<div class="bridge" role="img" aria-label="Contribution walk from ${gbp(pc)} planned to ${gbp(ac)} actual">${rows.join('')}</div>`;
}
function jobPager(id) {
  const list = UI.jobList.length ? UI.jobList : S().jobs.map(j => j.id);
  const i = list.indexOf(id); if (i < 0) return '';
  const prev = list[i - 1], next = list[i + 1];
  return `<div class="pager"><a class="btn btn-sm ${prev ? '' : 'is-disabled'}" ${prev ? `href="#/job/${prev}"` : 'aria-disabled="true"'} aria-label="Previous job">${icon('chevL')}Prev</a><span class="small muted" style="align-self:center">${i + 1} of ${list.length}</span><a class="btn btn-sm ${next ? '' : 'is-disabled'}" ${next ? `href="#/job/${next}"` : 'aria-disabled="true"'} aria-label="Next job">Next${icon('chevR')}</a></div>`;
}
function rechargeBox(j) {
  if (!j.recharge || !can('money')) return '';
  const r = activeRecharges().find(x => x.jobId === j.id);
  const cancelled = S().recharges.filter(x => x.jobId === j.id && x.status === 'cancelled');
  if (r) return `<div class="callout good"><div><span class="tag">Recharge draft</span><h3 class="mt8">${gbp(r.amount)} drafted — draft only</h3><p class="small text-2 mt8">Created by ${esc(user(r.createdBy).name)} at ${fmtTime(r.createdAt)}. Not invoiced and not counted as revenue.</p><p class="small mt8">${esc(r.note)}</p></div><div class="row">${can('recharge') ? `<button class="btn" data-act="editRecharge" data-id="${r.id}">Edit note</button><button class="btn btn-ghost" data-act="cancelRecharge" data-id="${r.id}">Cancel draft</button>` : ''}</div></div>`;
  return `<div class="callout"><div><span class="tag">Recovery opportunity</span><h3 class="mt8">${gbp(j.recharge.amount)} potential ${j.id === 'TH-001' ? 'waiting-time ' : ''}recharge</h3><p class="small text-2 mt8">${esc(j.recharge.basis)}</p>${cancelled.length ? `<p class="small muted mt8">A previous draft was cancelled · <button class="link" data-act="restoreRecharge" data-id="${cancelled[cancelled.length - 1].id}">Restore it</button></p>` : ''}</div>${can('recharge') ? `<button class="btn btn-primary" data-act="draftRecharge" data-id="${j.id}">Draft recharge</button>` : ''}</div>`;
}
function viewJob(route) {
  const j = job(decodeURIComponent(route.parts[1]));
  if (!j) return crumbs([{ label:'Jobs & Margins', href:'#/jobs' }, { label:'Not found' }]) + `<div class="card empty"><h4>Job not found</h4><p>No job with that reference exists in the demo dataset.</p></div>`;
  const money = can('money'), tab = route.q.tab || 'summary';
  const back = UI.crumb && UI.crumb.href ? UI.crumb : hasSection('jobs') ? { label:'Jobs & Margins', href:'#/jobs' } : { label:'Operations', href:'#/ops/today' };
  const today = j.date === TODAY;
  const pills = [today ? coverPill(j) : '', deliveryPill(j), isDone(j) ? podPill(j) : '', isDone(j) ? invPill(j) : '', money && isFlagged(j) ? `<span class="pill bad">Cost ${pct(costVarPct(j))} over plan</span>` : '', sharesForJob(j.id).length ? '<span class="pill info">Shared with customer</span>' : '', j.src === 'synthetic' && !today ? '<span class="pill plain">Synthetic history</span>' : ''].join('');
  const acts = [
    money && can('recharge') && j.recharge && !activeRecharges().some(r => r.jobId === j.id) ? `<button class="btn btn-primary" data-act="draftRecharge" data-id="${j.id}">Draft recharge</button>` : '',
    today && ['no_driver'].includes(coverState(j)) && can('cover') ? `<button class="btn btn-primary" data-act="proposeCover" data-id="${j.id}">Find driver cover</button>` : '',
    isDone(j) && j.pod.status === 'missing' && can('pod') ? `<button class="btn" data-act="uploadPod" data-id="${j.id}">${icon('upload')}Upload POD</button>` : '',
    can('act') ? `<button class="btn" data-act="raiseAction" data-type="job" data-id="${j.id}">${icon('plus')}Raise action</button>` : '',
  ].join('');
  const tabsList = [{ id:'summary', label:'Summary' }, ...(money ? [{ id:'cost', label:'Cost build-up' }] : []), { id:'delivery', label:'Delivery & POD' }, ...(can('share') ? [{ id:'sharing', label:'Customer sharing', count: sharesForJob(j.id).length || null }] : []), { id:'history', label:'Actions & history' }].map(t => Object.assign(t, { href:`#/job/${j.id}?tab=${t.id}` }));
  let body = '';
  if (tab === 'summary') body = jobSummary(j);
  if (tab === 'cost' && money) body = jobCost(j);
  if (tab === 'delivery') body = jobDelivery(j);
  if (tab === 'sharing' && can('share')) body = jobSharing(j);
  if (tab === 'history') body = jobHistory(j);
  const html = crumbs([back, { label:j.id }]) +
    `<div class="record-head"><div><h1>${esc(j.id)} · ${esc(j.dest)}</h1><div class="sub text-2 mt8">${esc(custName(j.customerId))} · ${fmtDate(j.date, true)} · slot ${esc(j.slot)} · ${j.subcontract ? 'Subcontracted' : `${esc(j.vehicleId)} · ${esc(j.driverId || (j.proposedDriverId ? j.proposedDriverId + ' (proposed)' : 'no driver'))}`}</div><div class="meta">${pills}</div></div><div class="stack" style="align-items:flex-end;gap:8px">${jobPager(j.id)}<div class="row">${acts}</div></div></div>` +
    tabs(tabsList, tab) + body;
  return money ? html : stripMoney(html);
}
function relatedCard(j) {
  const inv = j.invoice.invoiceId;
  const acts = S().actions.filter(a => a.recordId === j.id);
  return `<div class="card"><div class="card-head"><h3>Related records</h3></div><div class="card-pad"><dl class="kv">
    <dt>Customer</dt><dd>${recLink('customer', j.customerId, custName(j.customerId))}</dd>
    <dt>Customer ref</dt><dd>${esc(j.customerRef || '—')}</dd>
    <dt>Vehicle</dt><dd>${j.subcontract ? esc(j.subcontractor) : recLink('vehicle', j.vehicleId, `${j.vehicleId} · ${vehicle(j.vehicleId).type}`)}</dd>
    <dt>Driver</dt><dd>${j.driverId ? recLink('driver', j.driverId, driverName(j.driverId)) : j.proposedDriverId ? recLink('driver', j.proposedDriverId, driverName(j.proposedDriverId)) + ' <span class="pill warn">Proposed</span>' : j.subcontract ? 'Subcontractor' : '<span class="delta-bad">Not assigned</span>'}</dd>
    ${j.plannedDriverId ? `<dt>Planned driver</dt><dd>${recLink('driver', j.plannedDriverId, driverName(j.plannedDriverId))}</dd>` : ''}
    <dt>Invoice</dt><dd>${inv ? (can('cash') ? recLink('invoice', inv) : esc(inv)) : j.invoice.status === 'pending' ? 'Not yet invoiced' : j.invoice.status === 'unmodelled' ? '<span class="muted">Not modelled (synthetic history)</span>' : 'Not yet due'}</dd>
    <dt>Open actions</dt><dd>${acts.filter(a => a.status === 'open').length ? acts.filter(a => a.status === 'open').map(a => `<button class="link" data-act="openAction" data-id="${a.id}">${esc(a.title)}</button>`).join('<br>') : 'None'}</dd>
  </dl></div></div>`;
}
function jobSummary(j) {
  const money = can('money');
  const ops = `<div class="card"><div class="card-head"><h3>Job details</h3></div><div class="card-pad"><dl class="kv">
    <dt>Destination</dt><dd>${esc(j.dest)}${j.address ? `<div class="sub-line">${j.address.map(esc).join(', ')}</div>` : ''}</dd>
    <dt>Date and slot</dt><dd>${fmtDate(j.date, true)} · ${esc(j.slot)}</dd>
    <dt>Delivered</dt><dd>${isDone(j) ? `${esc(j.deliveredAt)} ${j.late ? '<span class="pill warn">Late</span>' : '<span class="pill ok">On time</span>'}` : statusLabel(j.status)}</dd>
    <dt>Miles</dt><dd>${j.miles != null ? `${int(j.miles)} planned · ${int(j.actualMiles)} actual` : '<span class="muted">Not in demo extract</span>'}</dd>
    <dt>Pallets</dt><dd>${j.pallets != null ? j.pallets : '<span class="muted">Not in demo extract</span>'}</dd>
    ${j.note ? `<dt>Note</dt><dd>${esc(j.note)}</dd>` : ''}
  </dl></div></div>`;
  if (!money) return `<div class="grid g2">${ops}${relatedCard(j)}</div>${j.date === TODAY ? todayCoverPanel(j) : ''}`;
  if (j.date === TODAY && !isDone(j)) {
    return `<div class="stat-row mb16"><div>${kpiS('Customer price', gbp(j.price))}</div><div>${kpiS('Planned cost', gbp(j.plannedCost), 'Booking snapshot')}</div><div>${kpiS('Planned contribution', gbp(plannedContrib(j)), pct(plannedContrib(j) / j.price * 100) + ' margin')}</div><div>${kpiS('Actual cost', '<span class="muted">After delivery</span>')}</div></div>${todayCoverPanel(j)}<div class="grid g2 mt16">${ops}${relatedCard(j)}</div>`;
  }
  if (j.actualCost == null) return `<div class="stat-row mb16"><div>${kpiS('Customer price', gbp(j.price))}</div><div>${kpiS('Planned cost', gbp(j.plannedCost))}</div><div>${kpiS('Planned contribution', gbp(plannedContrib(j)))}</div><div>${kpiS('Actual cost', '<span class="muted">Pending</span>', 'Awaiting cost data (fuel, telematics, timesheets)')}</div></div><div class="grid g2">${ops}${relatedCard(j)}</div>`;
  const pc = plannedContrib(j), ac = actualContrib(j), v = costVar(j);
  const lines = costLines(j);
  const uc = lines && j.miles ? `<div class="card"><div class="card-head"><h3>Unit costs</h3><span class="pill plain">Modelled</span></div><div class="card-pad"><table class="data"><thead><tr><th></th><th class="num">Planned</th><th class="num">Actual</th></tr></thead><tbody>
      <tr><td>Total job cost per mile</td><td class="num">${gbp(j.plannedCost / j.miles, { pence:true })}</td><td class="num">${gbp(j.actualCost / j.actualMiles, { pence:true })}</td></tr>
      <tr><td>Total job cost per pallet</td><td class="num">${gbp(j.plannedCost / j.pallets, { pence:true })}</td><td class="num">${gbp(j.actualCost / j.pallets, { pence:true })}</td></tr>
      <tr><td>Miles</td><td class="num">${int(j.miles)}</td><td class="num">${int(j.actualMiles)}</td></tr></tbody></table>
      <p class="small muted mt12">Fully loaded unit costs divide the whole job cost by miles or pallets. They are different from the ${vehicle(j.vehicleId) ? gbp(rateFor(j), { pence:true }) + '/mile vehicle running rate' : 'vehicle rate'} and the £5.50/pallet handling charge used inside the build-up.</p></div></div>` : '';
  const reasons = j.variance.length ? `<div class="card"><div class="card-head"><h3>Why cost moved from plan</h3><span class="small muted">${gbp(v, { sign:true })} total</span></div>${table({ cards:false, cols:[{ key:'reason', label:'Reason' }, { key:'amount', label:'Amount', num:true, render: x => gbp(x.amount, { sign:true }) }, { key:'share', label:'Share', num:true, render: x => pct(x.amount / v * 100, 0) }], rows:j.variance, foot:{ reason:'<b>Total cost variance</b>', amount: gbp(sum(j.variance, x => x.amount), { sign:true }), share:'100%' } })}</div>` : '';
  const head = ac < pc
    ? `<div class="callout mb16"><div><span class="tag">Contribution erosion</span><h3 class="mt8">${gbp(pc - ac)} below planned contribution</h3><p class="small text-2 mt8">The job remains contribution-positive at ${gbp(ac)}. Actual cost exceeded plan by ${gbp(v)} (${pct(costVarPct(j))}).${j.variance.length ? ' ' + j.variance.map(x => `${x.reason.replace(/\s*\(.*\)/, '').toLowerCase()} ${gbp(x.amount)}`).join(', ') + '.' : ''}</p></div></div>`
    : `<div class="callout good mb16"><div><span class="tag">On plan</span><h3 class="mt8">${ac > pc ? gbp(ac - pc) + ' above' : 'In line with'} planned contribution</h3></div></div>`;
  return `<div class="stat-row mb16"><div>${kpiS('Customer price', gbp(j.price))}</div><div>${kpiS('Planned contribution', gbp(pc), pct(pc / j.price * 100) + ' margin · cost ' + gbp(j.plannedCost))}</div><div>${kpiS('Actual contribution', gbp(ac), pct(ac / j.price * 100) + ' margin · cost ' + gbp(j.actualCost))}</div><div>${kpiS('Cost variance', `<span class="${isFlagged(j) ? 'delta-bad' : ''}">${gbp(v, { sign:true })}</span>`, (v > 0 ? '+' : '') + pct(costVarPct(j)) + ` vs ${threshold()}% threshold`)}</div></div>
    ${head}${rechargeBox(j) ? `<div class="mb16">${rechargeBox(j)}</div>` : ''}
    <div class="grid g-main"><div class="stack">${j.variance.length ? `<div class="card card-pad"><div class="section-title">Planned to actual contribution</div>${bridge(j)}</div>` : ''}${reasons}${j.variance.length ? '' : ops}</div><div class="stack">${uc}${relatedCard(j)}${j.variance.length ? ops : ''}</div></div>`;
}
const kpiS = (l, v, m) => `<div class="kpi"><span class="kpi-label">${l}</span><span class="kpi-value sm">${v}</span>${m ? `<span class="kpi-meta">${m}</span>` : ''}</div>`;
function jobCost(j) {
  const lines = costLines(j);
  if (!lines) return `<div class="card empty"><h4>Cost lines not in the demo extract</h4><p>Planned cost of ${gbp(j.plannedCost)} is the booking snapshot. Line detail would come from Vigo and the rate card in production.</p></div>`;
  const tbl = (title, ls, total, note) => `<div class="card"><div class="card-head"><h3>${title}</h3><span class="pill plain">${note}</span></div>${table({ cards:false, cols:[{ key:'label', label:'Line', render: l => esc(l.label) + (l.variance ? ' <span class="pill warn plain">Variance</span>' : '') }, { key:'amt', label:'Amount', num:true, render: l => gbp(l.amt, { pence:true }) }], rows:ls, foot:{ label:'<b>Total</b>', amt:`<b>${gbp(sum(ls, l => l.amt), { pence:true })}</b>` } })}${Math.abs(sum(ls, l => l.amt) - total) > 0.005 ? '<div class="caveat warn">Lines do not reconcile to the recorded total.</div>' : ''}</div>`;
  const snap = S().rateCards[0];
  return `<div class="grid g2">${tbl('Planned cost', lines.planned, j.plannedCost, 'Rate snapshot ' + snap.version)}${lines.actual ? tbl('Actual cost', lines.actual, j.actualCost, 'Illustrative actuals') : '<div class="card empty"><h4>Actual cost pending</h4></div>'}</div>
    <div class="caveat mt16">${icon('info')}<div>Costs are <b>modelled</b> from the rate card snapshot taken when the job was costed (vehicle rate includes a budgeted fuel element of £0.62/mile for artics). In production, actual fuel, mileage and waiting would be <b>source-reported</b> from fuel cards, telematics and Vigo. In this demo all actual costs are illustrative. Editing the rate card does not change this job.</div></div>`;
}
function jobDelivery(j) {
  const stages = ['walkaround','depart','arrive','unloading','complete','pod'];
  const tl = j.date === TODAY
    ? `<ul class="timeline">${stages.map(s => { const c = j.checkins.find(x => x.stage === s); return `<li><span class="dot ${c ? 'done' : ''}"></span><div><div class="strong">${STAGE_LABEL[s]}</div>${c && c.note ? `<div class="small muted">${esc(c.note)}</div>` : ''}</div><span class="small ${c ? '' : 'muted'}">${c ? fmtTime(c.at) : 'Pending'}</span></li>`; }).join('')}</ul>${j.eta && j.status === 'en_route' ? `<p class="small mt8">ETA ${fmtTime(j.eta)} (estimate from departure time)</p>` : ''}`
    : `<dl class="kv"><dt>Booked slot</dt><dd>${esc(j.slot)}</dd><dt>Delivered</dt><dd>${esc(j.deliveredAt || '—')} ${isDone(j) ? (j.late ? '<span class="pill warn">Late</span>' : '<span class="pill ok">On time</span>') : ''}</dd><dt>Check-in detail</dt><dd class="muted">Historic check-ins not in demo extract</dd></dl>`;
  const img = Store.pods[j.id];
  const pod = j.pod.status === 'received'
    ? `<p><span class="pill ok">POD received</span> <span class="small muted">${fmtDT(j.pod.at)}</span></p>${img ? `<img class="pod-thumb mt12" src="${img.dataUrl}" alt="Proof of delivery for ${esc(j.id)}">` : ''}<p class="small muted mt8">${esc(j.pod.source || '')}${j.pod.name ? ' · ' + esc(j.pod.name) : ''}</p>`
    : j.pod.status === 'missing' ? `<p><span class="pill bad">POD missing</span></p><p class="small text-2 mt8">Invoicing is blocked until the POD is received.</p>${can('pod') ? `<button class="btn btn-primary mt12" data-act="uploadPod" data-id="${j.id}">${icon('upload')}Upload POD</button>` : ''}` : `<p class="muted">POD is captured by the driver at delivery.</p>`;
  return `<div class="grid g2"><div class="card card-pad"><div class="section-title">Delivery progress</div>${tl}</div><div class="card card-pad"><div class="section-title">Proof of delivery</div>${pod}</div></div>${j.date === TODAY ? todayCoverPanel(j) : ''}`;
}
function todayCoverPanel(j) {
  const c = coverState(j);
  if (c === 'no_driver') return `<div class="uncovered mt16"><div><div class="strong">No driver assigned</div><div class="small text-2">Vehicle ${esc(j.vehicleId)} is available. Compare planning-eligible drivers and propose cover.</div></div>${can('cover') ? `<button class="btn btn-primary" data-act="proposeCover" data-id="${j.id}">Find driver cover</button>` : ''}</div>`;
  if (c === 'proposed') return `<div class="uncovered proposed mt16"><div><div class="strong">${esc(driverName(j.proposedDriverId))} — Proposed cover, awaiting Vigo confirmation</div><div class="small text-2">Proposed by ${esc(user(j.proposedBy).name)} at ${fmtTime(j.proposedAt)}. Vigo remains the system of record; nothing has been written to Vigo.</div></div>${can('cover') ? `<button class="btn" data-act="withdrawCover" data-id="${j.id}">Withdraw proposal</button>` : ''}</div>`;
  if (c === 'vehicle_unavailable') return `<div class="uncovered mt16"><div><div class="strong">Booked vehicle ${esc(j.vehicleId)} is off road</div><div class="small text-2">${esc(vehicle(j.vehicleId).vorReason || '')} No available 26t rigid exists in the current dataset, so this job stays uncovered until a vehicle is sourced.</div></div><div class="row"><button class="btn" data-act="rigidCheck" data-id="${j.id}">Check 26t rigids</button>${can('act') ? `<button class="btn btn-primary" data-act="raiseAction" data-type="job" data-id="${j.id}" data-preset="escalate">Record action / escalate</button>` : ''}</div></div>`;
  return '';
}
function jobSharing(j) {
  const cs = S().contacts.filter(c => c.customerId === j.customerId);
  const rows = cs.map(c => {
    const s = sharesForJob(j.id).find(x => x.contactId === c.id);
    return `<tr><td class="cell-main"><div class="strong">${esc(c.name)}</div><div class="sub-line">${esc(c.title)} · ${esc(c.email)}${c.notify ? '' : ' · opted out of notifications'}</div></td>
      <td data-label="Status">${s ? `<span class="pill ok">Shared</span><div class="sub-line">by ${esc(user(s.by) ? user(s.by).name : s.by)} · ${fmtDT(s.at)}</div>` : '<span class="pill plain">Not shared</span>'}</td>
      <td data-label="Show POD">${s ? `<label class="switch"><input type="checkbox" data-act-change="shareToggle" data-id="${s.id}" data-key="pod" ${s.pod ? 'checked' : ''} aria-label="Show POD"><span></span></label>` : '—'}</td>
      <td data-label="Show invoice">${s ? `<label class="switch"><input type="checkbox" data-act-change="shareToggle" data-id="${s.id}" data-key="invoice" ${s.invoice ? 'checked' : ''} aria-label="Show invoice"><span></span></label>` : '—'}</td>
      <td class="num" data-label="">${s ? `<button class="btn btn-sm" data-act="sendLink" data-job="${j.id}" data-contact="${c.id}">${icon('mail')}Send link</button> <button class="btn btn-sm btn-ghost" data-act="unshare" data-id="${s.id}">Stop sharing</button>` : `<button class="btn btn-sm btn-primary" data-act="share" data-job="${j.id}" data-contact="${c.id}">Share job</button>`}</td></tr>`;
  }).join('');
  const em = S().emails.filter(e => e.jobId === j.id);
  return `<div class="card"><div class="card-head"><h3>Customer access for ${esc(j.id)}</h3><span class="small muted">Per-job sharing only</span></div><div class="table-wrap"><table class="data cards"><thead><tr><th>Contact</th><th>Status</th><th>Show POD</th><th>Show invoice</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="card-pad"><div class="caveat">${icon('lock')}<div>A contact sees only the jobs shared with them — never other jobs, costs, margins or driver records. Invoice visibility is off by default and enabled per share.</div></div></div></div>
    <div class="card mt16"><div class="card-head"><h3>Notifications for this job</h3><span class="pill plain">Simulated — no email is sent</span></div>${em.length ? table({ cards:true, cols:[{ key:'subject', label:'Email', render: e => esc(e.subject) }, { key:'to', label:'To', render: e => esc(contact(e.to).email) }, { key:'at', label:'Created', render: e => fmtDT(e.at) }, { key:'link', label:'One-time link', render: e => { const st = linkState(S().links.find(l => l.token === e.token)); return `<span class="pill ${st === 'valid' ? 'ok' : st === 'used' ? 'plain' : 'warn'}">${cap(st)}</span>`; } }, { key:'x', label:'', render: e => `<button class="btn btn-sm" data-act="previewEmail" data-id="${e.id}">Preview</button>` }], rows: em }) : '<div class="empty small"><p>No notifications yet. A delivery notification is created automatically when a shared job is completed.</p></div>'}</div>`;
}
function jobHistory(j) {
  const acts = S().actions.filter(a => a.recordId === j.id);
  const rch = can('money') ? S().recharges.filter(r => r.jobId === j.id) : [];
  return `<div class="grid g2"><div class="card"><div class="card-head"><h3>Actions</h3>${can('act') ? `<button class="btn btn-sm" data-act="raiseAction" data-type="job" data-id="${j.id}">${icon('plus')}Raise action</button>` : ''}</div>${actionsTable(acts, true)}</div>
    <div class="card"><div class="card-head"><h3>Activity</h3></div>${activityFeed(30, e => e.recordId === j.id)}</div></div>
    ${rch.length ? `<div class="card mt16"><div class="card-head"><h3>Recharge drafts</h3></div>${rechargeTable(rch)}</div>` : ''}`;
}
