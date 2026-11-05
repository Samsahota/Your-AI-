/* ==========================================================================
   SIGN-IN, SIMULATED MAILBOX, DRIVER APP, CUSTOMER PORTAL
   ========================================================================== */
const DEMO_ACCOUNTS = [
  { kind:'staff', userId:'U01', label:'Paul Dyer', role:'Director', desc:'Full management view: margins, cash, fleet and administration', av:'red' },
  { kind:'staff', userId:'U02', label:'Lisa Grant', role:'Operations Manager', desc:'Job costs, margins, PODs, cover and recharge drafts' },
  { kind:'staff', userId:'U03', label:'Transport Manager', role:'Transport & Compliance', desc:'Operations, vehicles, drivers and compliance — no £ figures' },
  { kind:'staff', userId:'U04', label:'Driver D04', role:'Driver', desc:'Phone app: today’s jobs, check-ins, walkaround and POD' },
  { kind:'customer', contactId:'CT01', label:'Customer Contact', role:'Customer Portal', desc:'Northfield Fresh Foods — sees only deliveries shared with them' },
];
function brandBlock(dark = true) { return `<div class="brand" style="padding:0;border:0">${MARK}<div class="brand-mark"><span class="brand-word" ${dark ? '' : 'style="color:var(--charcoal)"'}>Haulage <span>Portal</span></span><span class="brand-sub">Trans Haul</span></div></div>`; }
function renderSignin() {
  const others = S().users.filter(u => !u.demo);
  const acct = a => {
    const u = a.userId ? user(a.userId) : null; const susp = u && u.status === 'suspended';
    return `<button class="acct" data-act="signIn" data-kind="${a.kind}" data-id="${a.userId || a.contactId}" ${susp ? 'disabled' : ''}><span class="avatar ${a.av || ''}">${esc(initials(a.label))}</span><span><span class="n">${esc(a.label)}</span> <span class="r">— ${esc(a.role)}</span><div class="d">${susp ? 'Suspended by the director' : esc(a.desc)}</div></span><span class="go">${susp ? icon('lock') : icon('chevR')}</span></button>`;
  };
  return `<div class="signin">
    <section class="signin-left"><div>${brandBlock()}
      <h1>Your haulage systems, brought together — <em>and acted on.</em></h1>
      <p class="lead">A management layer over Vigo, Xero, Bibby, Tachomaster, Paragon and SharePoint. It highlights what needs attention and helps your team act on it. Vigo stays the system of record.</p>
      <ul class="signin-points"><li>Yesterday's delivery, cost and contribution against plan</li><li>Missing PODs, unbilled work and estimated funding headroom</li><li>Today's cover, compliance follow-ups and team actions</li></ul></div>
      <div class="foot">THEL (Midlands) Ltd · Dunstable · Prepared by Your AI Ltd</div></section>
    <section class="signin-right"><span class="disclosure" style="align-self:flex-start;margin-bottom:24px"><i></i>Illustrative demo data · No live systems connected</span>
      <h2>Sign in</h2><p class="text-2 mt8 mb16">Choose a demo account. Each one sees only what its role permits.</p>
      ${DEMO_ACCOUNTS.map(acct).join('')}
      ${others.length ? `<div class="tag mt16 mb8">Other team members</div>${others.map(u => `<button class="acct" data-act="signIn" data-kind="staff" data-id="${u.id}" ${u.status === 'suspended' ? 'disabled' : ''}><span class="avatar">${esc(initials(u.name))}</span><span><span class="n">${esc(u.name)}</span> <span class="r">— ${esc(ROLE_LABEL[u.role])}</span><div class="d">${u.status === 'suspended' ? 'Suspended' : u.status === 'invited' ? 'Invited — first sign-in accepts the invitation' : esc(u.email)}</div></span><span class="go">${u.status === 'suspended' ? icon('lock') : icon('chevR')}</span></button>`).join('')}` : ''}
      <div class="row mt16" style="justify-content:space-between"><a class="btn btn-ghost" href="#/mailbox">${icon('mail')}Simulated customer mailbox</a><button class="btn btn-ghost" data-act="resetDemo">${icon('refresh')}Reset demo</button></div>
      <p class="small muted mt16">Demo clock: ${fmtDate(nowIso().slice(0, 10), true)}, ${fmtTime(nowIso())} GMT. Sign out and choose another account to switch roles.</p>
    </section></div>`;
}

/* ---------- simulated mailbox & one-time links ---------- */
function emailHTML(e) {
  const c = contact(e.to), j = job(e.jobId), l = S().links.find(x => x.token === e.token), st = linkState(l);
  return `<div class="sim-banner">${icon('info')}Simulated email — not sent. Shown to demonstrate the production notification.</div>
    <div class="email"><div class="email-meta"><span>From</span><span>Trans Haul Deliveries &lt;no-reply@transhaul.example&gt;</span><span>To</span><span>${esc(c.name)} &lt;${esc(c.email)}&gt;</span><span>Subject</span><span class="strong">${esc(e.subject)}</span><span>Created</span><span>${fmtDT(e.at)} (demo time)</span></div>
    <div class="email-body"><p>Hello,</p><p class="mt12">Your delivery <b>${esc(j.customerRef || j.id)}</b> (Trans Haul job ${esc(j.id)}) to <b>${esc(j.dest)}</b> has been completed${j.deliveredAt ? ` at ${esc(j.deliveredAt)}` : ''}.</p><p class="mt12">View the delivery status and proof of delivery using the secure link below. The link works once and expires after ${S().settings.linkHours} hours.</p>
    <p class="mt16"><button type="button" class="btn btn-primary" data-act="openLink" data-arg="${e.token}" ${st === 'valid' ? '' : 'disabled'}>${icon('link')}View delivery</button> <span class="small muted">Link ${st === 'valid' ? `valid until ${fmtDT(l.expiresAt)}` : st}</span></p>
    <p class="small muted mt16">You receive these emails because Trans Haul shared this delivery with you. Manage notifications in the portal.</p></div></div>`;
}
function renderMailbox() {
  const ems = S().emails;
  return `<div class="m-app" style="max-width:760px"><header class="m-top light"><a class="btn btn-ghost" href="#/signin" aria-label="Back to sign in">${icon('back')}</a><div class="t"><b>Simulated customer mailbox</b><span>Emails the portal would send · nothing is actually sent</span></div></header>
    <div class="m-body">${ems.length ? ems.map(e => { const l = S().links.find(x => x.token === e.token); const st = linkState(l); return `<div class="m-card"><div class="between"><div><div class="strong">${esc(e.subject)}</div><div class="small text-2">To ${esc(contact(e.to).email)} · ${fmtDT(e.at)}</div></div><span class="pill ${st === 'valid' ? 'ok' : st === 'used' ? 'plain' : 'warn'}">Link ${st}</span></div>
      <div class="row mt12"><button class="btn" data-act="previewEmail" data-id="${e.id}">${icon('mail')}Open email</button>${st === 'valid' ? `<button class="btn btn-primary" data-act="openLink" data-arg="${e.token}">${icon('link')}Use one-time link</button><button class="btn btn-ghost" data-act="expireLink" data-arg="${e.token}">Simulate ${S().settings.linkHours}h passing</button>` : `<button class="btn" data-act="openLink" data-arg="${e.token}">Try the link</button>`}</div></div>`; }).join('') : '<div class="m-card empty"><h4>No emails yet</h4><p>Notifications appear when a shared job is completed.</p></div>'}
    <p class="small muted">In production, the delivery email is sent to the authorised contact when a shared job completes. Each link signs the contact in once, shows only jobs shared with them, and expires after ${S().settings.linkHours} hours.</p></div></div>`;
}
function renderLinkResult(token) {
  const l = S().links.find(x => x.token === token); const st = linkState(l);
  const msg = { used:'This one-time link has already been used. For security, each link signs you in once.', expired:`This link has expired. Links are valid for ${S().settings.linkHours} hours.`, missing:'This link is not valid.' }[st];
  return `<div class="m-app"><header class="m-top light"><div class="t"><b>Trans Haul · Delivery updates</b></div></header><div class="m-body"><div class="m-card"><h3>Link not available</h3><p class="text-2 mt8">${msg}</p>${l ? `<button class="btn btn-primary m-btn mt16" data-act="newLink" data-arg="${token}">Send me a new link (simulated)</button>` : ''}<a class="btn m-btn mt8" href="#/mailbox">Back to mailbox</a></div></div></div>`;
}

/* ---------- DRIVER APP ---------- */
const STAGES = ['walkaround', 'depart', 'arrive', 'unloading', 'complete', 'pod'];
const STAGE_CTA = { walkaround:'Start walkaround check', depart:'Depart depot', arrive:'Arrived at customer', unloading:'Start unloading', complete:'Delivery complete', pod:'Upload POD' };
const WALK_ITEMS = ['Tyres & wheel security', 'Lights & indicators', 'Mirrors & cameras', 'Brakes & air lines', 'Fluid leaks', 'Bodywork & load security', 'Windscreen, wipers & washers', 'Dashboard warnings & tachograph'];
function driverJobs() { const d = me().driverId; return S().jobs.filter(j => j.date === TODAY && (j.driverId === d)).sort((a, b) => a.slot.localeCompare(b.slot)); }
function walkDone(vehicleId) { return S().walkarounds.find(w => w.vehicleId === vehicleId && w.driverId === me().driverId && (w.jobId && job(w.jobId) ? job(w.jobId).date === TODAY : w.at.slice(0, 10) === TODAY)); }
function nextStage(j) {
  if (!walkDone(j.vehicleId)) return 'walkaround';
  if (j.status === 'not_started') return 'depart';
  if (j.status === 'en_route') return 'arrive';
  if (j.status === 'on_site') return j.checkins.some(c => c.stage === 'unloading') ? 'complete' : 'unloading';
  if (j.status === 'delivered' && j.pod.status !== 'received') return 'pod';
  return null;
}
function stageDone(j, s) { return s === 'walkaround' ? !!walkDone(j.vehicleId) : s === 'pod' ? j.pod.status === 'received' : j.checkins.some(c => c.stage === s); }
function mapsBlock(j) {
  if (!j.address) return `<div class="caveat warn mt12">${icon('alert')}<div>${esc(j.addressNote || 'No usable delivery address has been supplied for this job.')} Maps is unavailable until the address is confirmed.</div></div><button class="btn m-btn mt8" disabled>${icon('map')}Open in Maps</button>`;
  return `<button class="btn m-btn mt12" data-act="openMaps" data-id="${j.id}">${icon('map')}Open in Maps</button>`;
}
function driverTop(sub) { const d = driver(me().driverId); return `<header class="m-top">${MARK}<div class="t"><b>Trans Haul Driver</b><span>${esc(d.id)} · ${esc(d.name)}${sub ? ' · ' + sub : ''}</span></div><button class="btn btn-ghost" data-act="signOut" aria-label="Sign out">${icon('logout')}</button></header>`; }
function renderDriverApp(route) {
  const sub = route.parts[1];
  if (sub === 'walkaround') return renderWalkaround(job(route.parts[2]));
  if (sub === 'pod') return renderDriverPod(job(route.parts[2]));
  if (sub === 'job') return renderDriverJob(job(route.parts[2]));
  const js = driverJobs(); const d = driver(me().driverId);
  const cur = js.find(j => nextStage(j)) || null;
  const v = cur ? vehicle(cur.vehicleId) : vehicle('V011');
  const safety = openDefects(v.id).filter(x => x.severity === 'safety');
  const hist = S().jobs.filter(j => j.driverId === d.id && j.date === YESTERDAY);
  return `<div class="m-app">${driverTop()}<div class="m-body">
    <div><div class="small muted">${fmtDate(TODAY, true)} · ${fmtTime(nowIso())}</div><div class="m-big">Morning, ${esc(d.name.split(' ')[0])}</div></div>
    <div class="m-card"><div class="between"><span class="m-label">Vehicle</span>${walkDone(v.id) ? (safety.length ? '<span class="pill bad">Not cleared — safety defect</span>' : openDefects(v.id).length ? '<span class="pill warn">Checked — minor defect</span>' : '<span class="pill ok">Walkaround done</span>') : '<span class="pill warn">Walkaround due</span>'}</div><div class="strong mt8">${v.id} · ${v.type}</div></div>
    ${cur ? driverJobCard(cur, true) : `<div class="m-card"><h3>All jobs complete</h3><p class="text-2 mt8">No further jobs assigned today. Thanks — drive safely.</p></div>`}
    ${js.filter(j => j !== cur).map(j => `<a class="m-card" href="#/driver-app/job/${j.id}" style="text-decoration:none;color:inherit;display:block"><div class="between"><span class="m-label">${isDone(j) && j.pod.status === 'received' ? 'Completed' : 'Later today'}</span>${deliveryPill(j)}</div><div class="strong mt8">${j.id} · ${esc(j.dest)} · ${esc(j.slot)}</div><div class="small text-2">${esc(custName(j.customerId))}${j.address ? '' : ' · address awaiting confirmation'}</div></a>`).join('')}
    ${hist.length ? `<div class="m-label mt8">Yesterday</div>${hist.map(j => `<div class="m-card"><div class="between"><span class="strong">${j.id} · ${esc(j.dest)}</span>${deliveryPill(j)}</div></div>`).join('')}` : ''}
  </div><div class="m-foot">${esc(disclosure().short)}</div>${driverActionBar(cur)}</div>`;
}
function driverJobCard(j, primary) {
  const ns = nextStage(j); const v = vehicle(j.vehicleId);
  const blocked = ns === 'depart' && openDefects(v.id).some(x => x.severity === 'safety');
  const steps = STAGES.map(s => `<i class="${stageDone(j, s) ? 'done' : s === ns ? 'cur' : ''}" title="${STAGE_LABEL[s]}"></i>`).join('');
  return `<div class="m-card"><div class="between"><span class="m-label">${primary ? 'Next job' : 'Job'}</span>${j.status === 'not_started' ? '<span class="pill">Not started</span>' : deliveryPill(j)}</div>
    <h3 class="mt8">${esc(j.id)} · ${esc(custName(j.customerId))}</h3>
    <div class="row mt8"><span class="pill dark plain">Booked ${esc(j.slot)}</span>${j.eta && j.status === 'en_route' ? `<span class="pill info plain">ETA ${fmtTime(j.eta)}</span>` : j.status === 'not_started' ? '<span class="small muted">ETA supplied after departure</span>' : ''}${j.pallets ? `<span class="small muted">${j.pallets} pallets</span>` : ''}</div>
    ${j.address ? `<div class="m-label mt16">Delivery address</div><div class="m-addr">${j.address.slice(0, -1).map(esc).join('<br>')}<br><b>${esc(j.address[j.address.length - 1])}</b></div><div class="small muted">Fictional demo address — postcode is not real or geocodable.</div>` : `<div class="m-label mt16">Delivery address</div>`}
    ${mapsBlock(j)}
    ${j.instructions ? `<div class="m-label mt16">Arrival instructions</div><p class="mt8">${esc(j.instructions)}</p>` : ''}
    <div class="between mt16"><span class="m-label">Progress</span><span class="small text-2">${ns ? `Step ${STAGES.indexOf(ns) + 1} of ${STAGES.length} · ${STAGE_LABEL[ns]}` : 'All steps complete'}</span></div><div class="m-steps mt8" aria-label="Progress">${steps}</div>
    ${blocked ? `<div class="caveat warn mt12">${icon('alert')}<div>A safety-critical defect is open on ${v.id}. Do not depart until the transport office clears the vehicle.</div></div>` : ''}
    ${!ns ? '<p class="mt12 delta-ok">Delivery complete and POD submitted.</p>' : ''}
    ${primary ? `<a class="btn btn-ghost btn-block mt8" href="#/driver-app/job/${j.id}">Job details and check-in times</a>` : ''}</div>`;
}
/* Pinned bottom bar: the next step is always within thumb reach, with undo for the last step. */
const UNDO_MIN = 10;
function lastUndo(j) {
  const last = [...j.checkins].reverse().find(c => ['depart', 'arrive', 'unloading', 'complete'].includes(c.stage));
  if (!last) return null;
  if (last.stage === 'complete' && j.pod.status === 'received') return null;
  if ((toD(nowIso()) - toD(last.at)) / 60000 > UNDO_MIN) return null;
  return last;
}
function driverActionBar(j) {
  if (!j) return '';
  const ns = nextStage(j); const u = lastUndo(j);
  const blocked = ns === 'depart' && openDefects(j.vehicleId).some(x => x.severity === 'safety');
  if (!ns && !u) return '';
  return `<div class="m-actionbar">
    ${ns ? `<button class="btn btn-primary m-btn" data-act="driverStage" data-id="${j.id}" data-arg="${ns}" ${blocked ? 'disabled' : ''}>${STAGE_CTA[ns]}</button>` : ''}
    ${u ? `<button class="btn btn-ghost btn-block m-undo" data-act="undoCheckin" data-id="${j.id}">${icon('back')}Undo “${STAGE_LABEL[u.stage]}” (${fmtTime(u.at)})</button>` : ''}
  </div>`;
}
function renderDriverJob(j) {
  if (!j || j.driverId !== me().driverId) return `<div class="m-app">${driverTop()}<div class="m-body"><div class="m-card"><h3>Job not available</h3><p class="text-2 mt8">You can only see jobs assigned to you.</p><a class="btn m-btn mt16" href="#/driver-app">Back</a></div></div></div>`;
  return `<div class="m-app">${driverTop()}<div class="m-body"><a class="btn btn-ghost" style="align-self:flex-start" href="#/driver-app">${icon('back')}Today</a>${driverJobCard(j, false)}
    <div class="m-card"><div class="m-label">Check-ins</div><ul class="timeline mt8">${STAGES.map(s => { const c = s === 'walkaround' ? walkDone(j.vehicleId) : j.checkins.find(x => x.stage === s); return `<li><span class="dot ${c ? 'done' : ''}"></span><div>${STAGE_LABEL[s]}</div><span class="small ${c ? '' : 'muted'}">${c ? fmtTime(c.at) : '—'}</span></li>`; }).join('')}</ul></div></div>${driverActionBar(j)}</div>`;
}
function renderWalkaround(j) {
  if (!j) return renderDriverApp({ parts:['driver-app'] });
  const v = vehicle(j.vehicleId);
  return `<div class="m-app">${driverTop('Walkaround')}<form class="m-body" data-form="walkaround" data-id="${j.id}">
    <a class="btn btn-ghost" style="align-self:flex-start" href="#/driver-app">${icon('back')}Cancel</a>
    <div><div class="m-big">Walkaround check</div><div class="text-2">${v.id} · ${v.type} · before first use today</div><div class="small mt8"><b id="walk-count">0 of ${WALK_ITEMS.length}</b> checked — mark each item Pass or Defect</div></div>
    <div class="m-card">${WALK_ITEMS.map((it, i) => `<div class="m-check"><span>${esc(it)}</span><div class="seg" role="group" aria-label="${esc(it)}"><button type="button" data-act="walkSet" data-i="${i}" data-v="pass" aria-pressed="false">Pass</button><button type="button" data-act="walkSet" data-i="${i}" data-v="defect" aria-pressed="false">Defect</button></div>
      <input type="hidden" name="r${i}" value=""><div class="walk-defect" id="wd${i}" hidden style="grid-column:1/-1"><div class="field mt8"><label for="sev${i}">Severity</label><select class="select" id="sev${i}" name="sev${i}" style="height:44px"><option value="minor">Minor — safe to use, report for repair</option><option value="safety">Safety-critical — vehicle must not be used</option></select></div><div class="field"><label for="note${i}">Describe the defect</label><textarea class="input" id="note${i}" name="note${i}" placeholder="What did you find?"></textarea></div></div></div>`).join('')}</div>
    <div class="caveat">${icon('info')}<div>Defects go straight to the transport office and are linked to ${v.id}. A safety-critical defect keeps the vehicle uncleared until it is assessed.</div></div>
    <button class="btn btn-primary m-btn" type="submit">Submit walkaround</button></form></div>`;
}
function renderDriverPod(j) {
  if (!j || j.driverId !== me().driverId) return renderDriverApp({ parts:['driver-app'] });
  return `<div class="m-app">${driverTop('POD')}<div class="m-body"><a class="btn btn-ghost" style="align-self:flex-start" href="#/driver-app">${icon('back')}Back</a>
    <div><div class="m-big">Proof of delivery</div><div class="text-2">${j.id} · ${esc(custName(j.customerId))} · ${esc(j.dest)}</div></div>
    <div class="m-card"><label class="dropzone" for="pod-file">${icon('camera')}<div class="strong mt8">Take or choose a photo of the signed POD</div><div class="small muted">JPEG or PNG · large photos are resized before saving</div></label><input id="pod-file" type="file" accept="image/*" capture="environment" class="sr-only" data-act-change="podFile">
      <button class="btn btn-block mt12" data-act="podSample" style="min-height:44px">Use sample POD image (demo)</button>
      <div id="pod-prev" class="mt12"></div></div>
    <button class="btn btn-primary m-btn" id="pod-submit" data-act="podSubmit" data-id="${j.id}" disabled>Submit POD</button>
    <p class="small muted">Saved in this browser for the demo. It is not sent to Vigo or SharePoint.</p></div></div>`;
}

/* ---------- CUSTOMER PORTAL ---------- */
function custShares() { return sharesForContact(Store.session.contactId); }
function custTop() { const c = contact(Store.session.contactId); return `<header class="m-top light">${MARK}<div class="t"><b>Trans Haul · Delivery updates</b><span>${esc(c.name)} · ${esc(customer(c.customerId).name)}</span></div><a class="btn btn-ghost" href="#/portal/settings" aria-label="Notification settings">${icon('admin')}</a><button class="btn btn-ghost" data-act="signOut" aria-label="Sign out">${icon('logout')}</button></header>`; }
function custJobCard(j, sh, full) {
  const pts = [['depart', 'Departed depot'], ['arrive', 'Arrived on site'], ['complete', 'Delivered']];
  const img = Store.pods[j.id];
  const inv = sh.invoice && j.invoice.invoiceId ? invoice(j.invoice.invoiceId) : null;
  const st = j.status === 'delivered' ? `<span class="pill ok">Delivered ${esc(j.deliveredAt)}</span>` : j.status === 'on_site' ? '<span class="pill info">On site</span>' : j.status === 'en_route' ? '<span class="pill info">On the way</span>' : '<span class="pill">Scheduled</span>';
  return `<div class="m-card"><div class="between"><span class="m-label">Delivery ${esc(j.customerRef || j.id)}</span>${st}</div><h3 class="mt8">${esc(j.dest)} · ${fmtDate(j.date)}</h3><div class="small text-2">Trans Haul job ${esc(j.id)} · booked slot ${esc(j.slot)}</div>
    ${j.date === TODAY ? `<ul class="timeline mt12">${pts.map(([s, l]) => { const c = j.checkins.find(x => x.stage === s); return `<li><span class="dot ${c ? 'done' : ''}"></span><div>${l}</div><span class="small ${c ? '' : 'muted'}">${c ? fmtTime(c.at) : '—'}</span></li>`; }).join('')}</ul>${j.status === 'en_route' && j.eta ? `<p class="small">Estimated arrival ${fmtTime(j.eta)}</p>` : ''}` : `<p class="small mt8">Delivered ${esc(j.deliveredAt || '')} on ${fmtDate(j.date, true)}</p>`}
    ${sh.pod ? (j.pod.status === 'received' ? `<div class="m-label mt16">Proof of delivery</div>${img ? `<img class="pod-thumb mt8" src="${img.dataUrl}" alt="Proof of delivery">` : '<p class="small mt8">POD received (paper copy held by Trans Haul).</p>'}<p class="small muted mt8">Received ${fmtDT(j.pod.at)}</p>` : isDone(j) ? '<p class="small muted mt12">Proof of delivery will appear here once uploaded.</p>' : '') : ''}
    ${sh.invoice ? `<div class="m-label mt16">Invoice</div>${inv ? `<p class="mt8">${esc(inv.id)} · ${gbp(j.price)} (this delivery, ex VAT) · issued ${fmtDay(inv.date)}</p>` : '<p class="small muted mt8">Not yet invoiced.</p>'}` : ''}
    ${full ? '' : `<a class="btn btn-block mt12" href="#/portal/job/${j.id}" style="min-height:44px">View delivery</a>`}</div>`;
}
function renderCustomer(route) {
  const sub = route.parts[1]; const c = contact(Store.session.contactId);
  const shares = custShares();
  if (sub === 'settings') return `<div class="m-app">${custTop()}<div class="m-body"><a class="btn btn-ghost" style="align-self:flex-start" href="#/portal">${icon('back')}Deliveries</a><div class="m-card"><h3>Notifications</h3><div class="between mt12"><div><div class="strong">Email me when a delivery is completed</div><div class="small text-2">Sent to ${esc(c.email)} with a one-time sign-in link (simulated).</div></div><label class="switch"><input type="checkbox" data-act-change="notify" ${c.notify ? 'checked' : ''} aria-label="Delivery notifications"><span></span></label></div></div></div></div>`;
  if (sub === 'job') {
    const id = decodeURIComponent(route.parts[2] || ''); const sh = shares.find(s => s.jobId === id);
    if (!sh) return `<div class="m-app">${custTop()}<div class="m-body"><div class="m-card"><h3>Delivery not available</h3><p class="text-2 mt8">We couldn't find a delivery shared with you under that reference. Trans Haul shares deliveries individually — contact your account manager if you expected to see it.</p><a class="btn m-btn mt16" href="#/portal">Back to your deliveries</a></div></div></div>`;
    return `<div class="m-app">${custTop()}<div class="m-body"><a class="btn btn-ghost" style="align-self:flex-start" href="#/portal">${icon('back')}Deliveries</a>${custJobCard(job(id), sh, true)}</div></div>`;
  }
  const list = shares.map(s => ({ s, j: job(s.jobId) })).sort((a, b) => b.j.date.localeCompare(a.j.date));
  return `<div class="m-app">${custTop()}<div class="m-body">
    ${Store.session.via === 'link' ? `<div class="caveat">${icon('lock')}<div>Signed in with a one-time link (simulated). The link has now been used and can't be opened again.</div></div>` : ''}
    <div><div class="m-big">Your deliveries</div><div class="text-2">Deliveries Trans Haul has shared with you</div></div>
    <form class="m-card" data-form="custFind"><label class="m-label" for="cref">Find a delivery</label><div class="row mt8" style="flex-wrap:nowrap"><input class="input" id="cref" name="ref" placeholder="Job or delivery reference" style="height:44px;flex:1"><button class="btn" style="min-height:44px" type="submit">Find</button></div><div class="small muted mt8">Only deliveries shared with you can be found.</div></form>
    ${list.length ? list.map(x => custJobCard(x.j, x.s, false)).join('') : '<div class="m-card empty"><h4>No deliveries shared yet</h4><p>Trans Haul will share deliveries with you individually.</p></div>'}
  </div><div class="m-foot">Illustrative demo · You can only see deliveries shared with you.</div></div>`;
}
