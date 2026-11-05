/* ==========================================================================
   ROUTER, EVENTS, ACTION HANDLERS, BOOT
   ========================================================================== */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = (path || '').split('/').filter(Boolean);
  const q = {}; (qs || '').split('&').filter(Boolean).forEach(p => { const [k, v] = p.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
  return { path: path || '', parts, q };
}
const OFFICE_ROUTES = [
  ['dashboard', 'overview', viewOverview], ['overview', 'overview', viewOverview], ['jobs', 'jobs', viewJobs], ['job', ['jobs','operations'], viewJob],
  ['ops', 'operations', viewOps], ['cash', 'cash', viewCash], ['customer', 'cash', viewCustomer], ['invoice', 'cash', viewInvoice],
  ['fleet', 'fleet', viewFleet], ['vehicle', 'fleet', viewVehicle], ['driver', 'fleet', viewDriver], ['document', 'fleet', viewDocument],
  ['admin', 'admin', viewAdmin],
];
let lastPath = null;
function render() {
  const app = document.getElementById('app');
  const r = parseRoute(); const s = Store.session;
  const first = r.parts[0];
  if (first === 'mailbox') { app.innerHTML = renderMailbox(); return done(r); }
  if (first === 'link') {
    if (Svc.openLink(r.parts[1]) === 'ok') { location.replace('#/portal'); return; }
    app.innerHTML = renderLinkResult(r.parts[1]); return done(r);
  }
  if (!s) { if (first !== 'signin') { location.replace('#/signin'); return; } app.innerHTML = renderSignin(); return done(r); }
  if (s.kind === 'customer') {
    if (!contact(s.contactId)) { signOut(); return; }
    if (first !== 'portal') { location.replace('#/portal'); return; }
    app.innerHTML = renderCustomer(r); return done(r);
  }
  const u = me();
  if (!u || u.status === 'suspended') { signOut(); toast('This account is suspended.', 'err'); return; }
  if (u.role === 'driver') {
    if (first !== 'driver-app') { location.replace('#/driver-app'); return; }
    app.innerHTML = renderDriverApp(r); return done(r);
  }
  const def = OFFICE_ROUTES.find(x => x[0] === first);
  if (!def) { location.replace('#/dashboard'); return; }
  const need = Array.isArray(def[1]) ? def[1] : [def[1]];
  const allowed = need.some(n => n === 'cash' ? can('cash') : hasSection(n));
  const section = { job: hasSection('jobs') ? (UI.crumb && UI.crumb.href.startsWith('#/ops') ? 'operations' : 'jobs') : 'operations', customer:'cash', invoice:'cash', vehicle:'fleet', driver:'fleet', document:'fleet', ops:'operations', dashboard:'overview' }[first] || first;
  app.innerHTML = renderOffice({ section, view: () => allowed ? def[2](r) : denied() });
  done(r);
}
function done(r) {
  document.body.classList.toggle('has-actionbar', !!document.querySelector('.m-actionbar'));
  const key = r.path + JSON.stringify(r.q);
  if (key !== lastPath) {
    const focus = r.q.focus;
    if (focus) { const el = document.getElementById(focus); if (el) setTimeout(() => el.scrollIntoView({ block:'start', behavior:'smooth' }), 30); }
    else window.scrollTo(0, 0);
  }
  lastPath = key;
  // remember list context for record breadcrumbs
  const p = r.parts[0];
  if (p === 'jobs' && r.parts[1] !== 'model') UI.crumb = { label:'Jobs & Margins', href:'#/jobs' };
  if (p === 'ops') { UI.crumb = { label:'Operations', href:'#/' + r.path }; UI.jobList = S().jobs.filter(j => r.parts[1] === 'pods' ? isDone(j) && (j.pod.status === 'missing' || j.invoice.status === 'pending') : j.date === TODAY).map(j => j.id); }
  if (p === 'overview' || p === 'dashboard') { UI.crumb = { label:'Dashboard', href:'#/dashboard' }; }
}
function onRoute() { render(); }   // replaced in the live build
function rerender() { const y = window.scrollY; render(); window.scrollTo(0, y); }
function go(href) { if (location.hash === href) rerender(); else location.hash = href; }
function signOut() { document.querySelectorAll('.toast').forEach(t => t.remove()); document.getElementById('print-root').innerHTML = ''; Store.setSession(null); UI.navOpen = false; Modal.close(); location.hash = '#/signin'; render(); }

/* ---------- modals for workflows ---------- */
const ownerOptions = sel => S().users.filter(u => ['director','operations','transport'].includes(u.role) && u.status !== 'suspended').map(u => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.name)} — ${esc(ROLE_LABEL[u.role])}</option>`).join('');
function modalDraftRecharge(jobId) {
  const j = job(jobId);
  Modal.open({ title:`Draft recharge · ${j.id}`, sub:`${esc(custName(j.customerId))} · ${esc(j.dest)} · ${fmtDate(j.date)}`,
    body:`<div class="field"><label for="ra">Amount</label><input class="input" id="ra" name="amount" type="number" min="1" step="1" value="${j.recharge.amount}" max="${j.recharge.amount}"><div class="hint">Evidenced candidate: ${gbp(j.recharge.amount)}. A draft cannot exceed it.</div></div>
      <div class="field"><label for="rn">Explanatory note for the customer</label><textarea class="input" id="rn" name="note">${esc(j.recharge.basis)}</textarea></div>
      <div class="caveat">${icon('info')}<div>A draft is an internal proposal. It does not raise an invoice and does not change revenue, invoiced totals or cash.</div></div>${errBox}`,
    foot:'<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn btn-primary" type="submit">Create draft</button>',
    onSubmit: async fd => { await Svc.draftRecharge(jobId, fd.get('amount'), fd.get('note').trim()); Modal.close(); toast(`Recharge draft of ${gbp(Number(fd.get('amount')))} created for ${jobId} — draft only`); rerender(); } });
}
function modalEditRecharge(id) {
  const r = byId(S().recharges, id);
  Modal.open({ title:`Edit recharge note · ${r.jobId}`, sub:`Draft ${gbp(r.amount)}`, body:`<div class="field"><label for="en">Explanatory note</label><textarea class="input" id="en" name="note">${esc(r.note)}</textarea></div>${errBox}`,
    foot:'<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn btn-primary" type="submit">Save note</button>',
    onSubmit: async fd => { const n = fd.get('note').trim(); if (!n) throw new Error('The note cannot be empty.'); await Svc.editRecharge(id, n); Modal.close(); toast('Recharge note updated'); rerender(); } });
}
function modalProposeCover(jobId) {
  const j = job(jobId);
  const cands = S().drivers.filter(d => ['available'].includes(d.todayState) || d.id === j.proposedDriverId);
  const unavailable = S().drivers.filter(d => !cands.includes(d) && !d.id.startsWith('A'));
  const row = d => { const chk = Svc.coverCheck(jobId, d.id); return `<label class="radio-card" data-cand="${d.id}"><input type="radio" name="driver" value="${d.id}"><div><div class="strong">${d.id} · ${esc(d.name)}</div><div class="small text-2">${esc(d.engagement)} · estimated ${hm(d.hoursAvailMin)} available today</div></div>${chk.ok ? '<span class="pill ok">Planning-eligible</span>' : '<span class="pill bad">Not eligible</span>'}</label>`; };
  Modal.open({ title:`Find driver cover · ${j.id}`, sub:`${esc(j.dest)} · booked ${esc(j.slot)} · vehicle ${esc(j.vehicleId)} available · illustrative requirement ${hm(j.requiredMin)}`,
    body:`<div class="label tag mb8">Available drivers</div>${cands.map(row).join('')}
      <details class="mt8"><summary class="small muted" style="cursor:pointer">${unavailable.length} other core drivers are allocated, on rest days or on leave</summary><div class="small text-2 mt8">${unavailable.map(d => `${d.id} (${TODAY_STATE[d.todayState] || '—'})`).join(' · ')}</div></details>
      <div class="caveat warn mt12">${icon('alert')}<div>Hours shown are an <b>illustrative planning estimate</b>, not a legal determination of drivers' hours. Confirm in Tachomaster and allocate in Vigo. This records <b>proposed cover — awaiting Vigo confirmation</b>; nothing is written to Vigo.</div></div>${errBox}`,
    foot:'<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn btn-primary" type="submit">Propose cover</button>',
    onOpen: el => el.addEventListener('change', e => { if (e.target.name === 'driver') { el.querySelectorAll('.radio-card').forEach(c => c.classList.toggle('sel', c.dataset.cand === e.target.value)); el.querySelector('.m-err').hidden = true; } }),
    onSubmit: async fd => { const d = fd.get('driver'); if (!d) throw new Error('Select a driver to propose.'); await Svc.proposeCover(jobId, d); Modal.close(); const t = todayStats(); toast(`${d} proposed for ${jobId} — planned cover now ${t.planned}/${t.booked}`); rerender(); } });
}
function modalRaiseAction(type, id, preset) {
  const presets = { escalate: { title: `Source replacement 26t rigid for ${id} (V014 VOR)`, priority:'high', owner: myRole() === 'transport' ? 'U02' : 'U03', notes:'V014 off road (air leak). No available 26t rigid in fleet dataset. Options: hire-in, subcontract, or agree a revised slot with the customer.' } };
  const p = presets[preset] || {};
  const recOpts = [['', 'No linked record'], ...S().jobs.filter(j => j.date >= WEEK_START).map(j => ['job:' + j.id, 'Job ' + j.id + ' · ' + j.dest]), ...S().vehicles.map(v => ['vehicle:' + v.id, 'Vehicle ' + v.id]), ...S().drivers.map(d => ['driver:' + d.id, 'Driver ' + d.id]), ...S().documents.map(d => ['document:' + d.id, 'Document · ' + d.title])];
  const cur = type && id ? type + ':' + id : '';
  if (cur && !recOpts.some(o => o[0] === cur)) recOpts.push([cur, cap(type) + ' ' + id]);
  Modal.open({ title: preset === 'escalate' ? `Record action / escalate · ${id}` : 'Raise action', sub:'Internal action — tracked in the portal, not written to source systems',
    body:`<div class="field"><label for="at">Action</label><input class="input" id="at" name="title" value="${esc(p.title || '')}" placeholder="What needs to happen?"></div>
      <div class="form-grid"><div class="field"><label for="ao">Owner</label><select class="select" id="ao" name="owner">${ownerOptions(p.owner || me().id)}</select></div>
      <div class="field"><label for="ap">Priority</label><select class="select" id="ap" name="priority">${['high','medium','low'].map(x => `<option value="${x}" ${x === (p.priority || 'medium') ? 'selected' : ''}>${cap(x)}</option>`).join('')}</select></div>
      <div class="field"><label for="ad">Follow-up date</label><input class="input" id="ad" name="due" type="date" value="${TODAY}"></div>
      <div class="field"><label for="ar">Linked record</label><select class="select" id="ar" name="rec">${recOpts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
      <div class="field"><label for="an">Notes</label><textarea class="input" id="an" name="notes">${esc(p.notes || '')}</textarea></div>${errBox}`,
    foot:'<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn btn-primary" type="submit">Raise action</button>',
    onSubmit: async fd => { const [rt, ri] = (fd.get('rec') || '').split(':'); if (!fd.get('due')) throw new Error('Set a follow-up date.'); const a = await Svc.raiseAction({ title: fd.get('title').trim(), ownerId: fd.get('owner'), priority: fd.get('priority'), due: fd.get('due'), recordType: rt || null, recordId: ri || null, notes: fd.get('notes').trim() }); Modal.close(); toast(`Action ${a.id} assigned to ${user(a.ownerId).name}`); rerender(); } });
}
function modalAction(id) {
  const a = byId(S().actions, id);
  const prog = [{ t:a.createdAt, by:a.createdBy, note:'Raised' + (a.notes ? ' — ' + a.notes : '') }, ...a.progress];
  Modal.open({ title:a.title, sub:`${a.id} · ${a.recordId ? `${cap(a.recordType)} ${a.recordId}` : 'No linked record'} · owner ${esc(user(a.ownerId).name)}`, wide:true,
    body:`<div class="row mb12">${PRIORITY[a.priority]}${a.status === 'done' ? '<span class="pill ok">Completed</span>' : '<span class="pill">Open</span>'}<span class="small ${a.status === 'open' && a.due < TODAY ? 'delta-bad' : 'muted'}">Follow-up ${fmtDate(a.due, true)}</span>${a.recordId ? `<span class="small">${recLink(a.recordType, a.recordId, 'Open linked ' + a.recordType)}</span>` : ''}</div>
      <ul class="timeline">${prog.map(p => `<li><span class="dot done"></span><div><div class="small strong">${esc(user(p.by) ? user(p.by).name : p.by)}</div><div class="small">${esc(safeText(p.note))}</div></div><span class="small muted">${fmtDT(p.t)}</span></li>`).join('')}</ul>
      ${a.status === 'open' && can('act') ? `<div class="field mt12"><label for="pn">Record progress</label><textarea class="input" id="pn" name="note" placeholder="What has happened?"></textarea></div>` : ''}${errBox}`,
    foot: !can('act') ? '<button type="button" class="btn" data-act="modalClose">Close</button>' : a.status === 'open' ? `<button type="button" class="btn" data-act="modalClose">Close</button><button type="button" class="btn" data-act="completeAction" data-id="${a.id}">Mark complete</button><button class="btn btn-primary" type="submit">Add progress</button>` : `<button type="button" class="btn" data-act="reopenAction" data-id="${a.id}">Reopen</button><button type="button" class="btn btn-primary" data-act="modalClose">Close</button>`,
    onSubmit: async fd => { await Svc.addProgress(id, fd.get('note') || ''); toast('Progress recorded'); rerender(); modalAction(id); } });
}
function modalFollowUp(cid) {
  const c = byId(S().compliance, cid);
  const method = c.kind === 'licence' ? ['Driver presented licence and check code — DVLA check to follow', 'Reminder issued to driver', 'Escalated to transport manager'] : c.kind === 'tacho' ? ['Debrief held with driver — signature to be captured in Tachomaster', 'Driver statement taken', 'Escalated to operations director'] : ['Booked', 'Reminder issued', 'Other'];
  Modal.open({ title:`Record follow-up · ${c.driverId || c.vehicleId}`, sub: esc(c.title),
    body:`<div class="field"><label for="fm">What was done</label><select class="select" id="fm" name="method">${method.map(m => `<option>${esc(m)}</option>`).join('')}</select></div>
      <div class="field"><label for="fn">Notes</label><textarea class="input" id="fn" name="note" placeholder="Record the conversation, evidence seen and next step"></textarea></div>
      <div class="field"><label for="fd">Next review date</label><input class="input" id="fd" name="next" type="date" value="${addDays(TODAY, 7)}"></div>
      <div class="caveat warn">${icon('alert')}<div>${c.kind === 'licence' ? 'This records an internal follow-up. It is <b>not</b> a DVLA licence check and does not verify entitlement.' : c.kind === 'tacho' ? 'This records an internal follow-up. It is <b>not</b> a sign-off in Tachomaster.' : 'Internal record only.'}</div></div>${errBox}`,
    foot:'<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn btn-primary" type="submit">Record follow-up</button>',
    onSubmit: async fd => { await Svc.recordFollowUp(cid, { note: fd.get('note'), method: fd.get('method'), nextDate: fd.get('next') }); Modal.close(); toast(`Follow-up recorded for ${c.driverId || c.vehicleId}`); rerender(); } });
}
function modalResolveDefect(id) {
  const d = byId(S().defects, id);
  Modal.open({ title:`Record rectification · ${d.vehicleId}`, sub:`${esc(d.item)} — ${d.severity === 'safety' ? 'safety-critical' : 'minor'}`,
    body:`<div class="field"><label for="dn">What was done</label><textarea class="input" id="dn" name="note" placeholder="Repair carried out, by whom, and checks made"></textarea></div><div class="caveat">${icon('info')}<div>Recording rectification clears the defect in the portal${d.status === 'vor' ? ' and returns the vehicle to service' : ''}. Keep the workshop record as evidence.</div></div>${errBox}`,
    foot:'<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn btn-primary" type="submit">Record rectification</button>',
    onSubmit: async fd => { await Svc.resolveDefect(id, fd.get('note') || ''); Modal.close(); toast(`${d.vehicleId} defect marked rectified`); rerender(); } });
}
function readImage(file) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type)) return rej(new Error('Choose an image file (JPEG or PNG).'));
    if (file.size > 15 * 1024 * 1024) return rej(new Error('That image is over 15 MB. Choose a smaller photo.'));
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('The image could not be read.'));
    fr.onload = () => { const img = new Image(); img.onload = () => { const max = 1100, k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const url = c.toDataURL('image/jpeg', 0.72); res({ dataUrl: url, name: file.name, size: Math.round(url.length * 0.75) }); }; img.onerror = () => rej(new Error('The image could not be opened.')); img.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
function samplePod(j) {
  const c = document.createElement('canvas'); c.width = 720; c.height = 960; const g = c.getContext('2d');
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 720, 960); g.fillStyle = '#25282D'; g.fillRect(0, 0, 720, 90);
  g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.fillText('TRANS HAUL', 36, 58); g.font = '20px sans-serif'; g.fillText('DELIVERY NOTE — DEMO SAMPLE', 380, 56);
  g.fillStyle = '#25282D'; g.font = '24px sans-serif';
  [['Job', j.id], ['Customer ref', j.customerRef || '—'], ['Customer', custName(j.customerId)], ['Delivered to', j.dest], ['Date', fmtDate(j.date, true)], ['Pallets', String(j.pallets || '—')]].forEach(([k, v], i) => { g.fillStyle = '#6B737D'; g.fillText(k, 36, 160 + i * 56); g.fillStyle = '#1E2125'; g.fillText(v, 250, 160 + i * 56); });
  g.strokeStyle = '#9aa1a9'; g.strokeRect(36, 520, 648, 220); g.fillStyle = '#6B737D'; g.fillText('Received in good condition — signature', 52, 556);
  g.strokeStyle = '#1d3d8f'; g.lineWidth = 4; g.beginPath(); g.moveTo(90, 680); g.bezierCurveTo(160, 600, 220, 720, 290, 650); g.bezierCurveTo(340, 610, 380, 700, 470, 640); g.stroke();
  g.fillStyle = '#B3141A'; g.font = 'bold 22px sans-serif'; g.fillText('ILLUSTRATIVE SAMPLE — NOT A REAL DOCUMENT', 36, 820);
  return { dataUrl: c.toDataURL('image/jpeg', 0.75), name:'sample-pod-' + j.id + '.jpg', size: 0 };
}
let pendingPod = null;
function modalUploadPod(jobId) {
  const j = job(jobId); pendingPod = null;
  Modal.open({ title:`Upload POD · ${j.id}`, sub:`${esc(custName(j.customerId))} · ${esc(j.dest)} · delivered ${fmtDate(j.date)}`,
    body:`<label class="dropzone" for="mpod">${icon('upload')}<div class="strong mt8">Choose a POD image</div><div class="small muted">JPEG or PNG · resized before saving</div></label><input id="mpod" type="file" accept="image/*" class="sr-only" data-act-change="podFileModal">
      <div class="row mt12"><button type="button" class="btn btn-sm" data-act="podSampleModal" data-id="${j.id}">Use sample image</button><button type="button" class="btn btn-sm btn-ghost" data-act="podPaper" data-id="${j.id}">Record paper POD received (no image)</button></div>
      <div id="mpod-prev" class="mt12"></div><p class="small muted mt12">Stored in this browser for the demo. Not sent to Vigo or SharePoint.</p>${errBox}`,
    foot:'<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn btn-primary" type="submit" id="mpod-submit" disabled>Save POD</button>',
    onSubmit: async () => { if (!pendingPod) throw new Error('Choose an image first.'); await Svc.podUpload(jobId, pendingPod); Modal.close(); toast(`POD saved for ${jobId}`); rerender(); } });
}
function modalInvite() {
  const secs = SECTIONS.filter(s => !['overview','admin'].includes(s.id));
  Modal.open({ title:'Invite user', sub:'Invitation is simulated — no email is sent',
    body:`<div class="form-grid"><div class="field"><label for="in">Full name</label><input class="input" id="in" name="name" placeholder="e.g. Jordan Reeves"></div><div class="field"><label for="ie">Email address</label><input class="input" id="ie" name="email" type="email" placeholder="name@transhaul.example"></div></div>
      <div class="field"><label for="ir">Role</label><select class="select" id="ir" name="role"><option value="viewonly">View Only — explicit sections</option><option value="operations">Operations</option><option value="transport">Transport & Compliance</option><option value="director">Director</option></select></div>
      <div id="vo-box"><div class="label small strong text-2">Sections this person can see (Dashboard is always included)</div>${secs.map(s => `<label class="check"><input type="checkbox" name="sec" value="${s.id}"><span>${s.label}</span></label>`).join('')}
      <label class="check" style="border-top:1px solid var(--line-2);margin-top:4px"><input type="checkbox" name="money" id="imoney"><span><b>Can view financial figures</b><div class="small muted">Off by default. Required for Customers & Cash.</div></span></label></div>${errBox}`,
    foot:'<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn btn-primary" type="submit">Send invitation</button>',
    onOpen: el => el.addEventListener('change', e => { if (e.target.name === 'role') el.querySelector('#vo-box').hidden = e.target.value !== 'viewonly'; if (e.target.value === 'cash' && e.target.checked) el.querySelector('#imoney').checked = true; if (e.target.id === 'imoney' && !e.target.checked) { const c = el.querySelector('input[value=cash]'); c.checked = false; } }),
    onSubmit: async fd => { const u = await Svc.invite({ name: fd.get('name') || '', email: fd.get('email') || '', role: fd.get('role'), sections: fd.getAll('sec'), money: !!fd.get('money') }); Modal.close(); toast(`${u.name} invited as ${ROLE_LABEL[u.role]} (simulated)`); rerender(); } });
}
const PLANNED = {
  'xero-invoice': ['Prepare invoices in Xero', 'Planned integration. In production the portal would create draft invoices in Xero for ready jobs through Trans Haul’s own authorised Xero connection, then read back the invoice number and status. In this demo nothing is sent to Xero.'],
  'xero-chase': ['Chase in Xero', 'Planned integration. Credit control stays in Xero. The portal would link to the invoice and record the chase as an internal action. No connection exists in this demo.'],
  'sharepoint': ['Open in SharePoint', 'Planned integration. Documents would be read where Trans Haul already stores them, using read-only Microsoft Graph access to the selected SharePoint site. Not connected in this demo.'],
};
function modalPlanned(key) {
  let p = PLANNED[key];
  if (!p && key.startsWith('conn-')) { const c = byId(S().connections, key.slice(5)); p = [`${c.name} — what production needs`, `<b>Status:</b> ${esc(c.state)}. <b>Method:</b> ${esc(c.method)}.<br><br>Trans Haul authorises the connection from its own ${esc(c.name)} account, with read-only access to: ${esc(c.data)}. Credentials are held server-side (never in the browser), and data is refreshed by scheduled server jobs. Each haulier configures and authorises its own connections — the portal never shares data between hauliers.`]; }
  Modal.open({ title: p[0], sub:'<span class="pill plain">Planned</span>', body:`<p class="text-2" style="line-height:1.6">${p[1]}</p>`, foot:'<button type="button" class="btn btn-primary" data-act="modalClose">Close</button>' });
}
function modalEmail(id) {
  const e = byId(S().emails, id);
  Modal.open({ title:'Delivery notification', sub:'Simulated', wide:true, body: emailHTML(e), foot:'<button type="button" class="btn" data-act="modalClose">Close</button>' });
}
function modalRigids(jobId) {
  const rs = S().vehicles.filter(v => v.typeKey === 'R26');
  Modal.open({ title:'26t rigids today', sub:`Checking a replacement for ${jobId}`,
    body: table({ cards:false, cols:[{ key:'id', label:'Vehicle', render: v => `<span class="id">${v.id}</span>` }, { key:'s', label:'Status', render: v => { const s = vehicleStatus(v); return `<span class="pill ${s.cls}">${s.label}</span>`; } }, { key:'j', label:'Today', render: v => S().jobs.filter(j => j.vehicleId === v.id && j.date === TODAY).map(j => `${j.id} ${j.slot}`).join(', ') || 'Not allocated' }], rows: rs }) + `<div class="caveat warn mt12">${icon('alert')}<div>No 26t rigid is free today in the supplied dataset. The job stays uncovered — record an action to hire in, subcontract or rebook.</div></div>`,
    foot:`<button type="button" class="btn" data-act="modalClose">Close</button>${can('act') ? `<button type="button" class="btn btn-primary" data-act="raiseAction" data-type="job" data-id="${jobId}" data-preset="escalate">Record action / escalate</button>` : ''}` });
}
function confirmModal(title, body, label, fn, danger) {
  Modal.open({ title, body:`<p class="text-2">${body}</p>${errBox}`, foot:`<button type="button" class="btn" data-act="modalClose">Cancel</button><button class="btn ${danger ? 'btn-primary' : 'btn-dark'}" type="submit">${label}</button>`, onSubmit: async () => { await fn(); Modal.close(); } });
}

/* ---------- exports & print ---------- */
function exportJobs() {
  const list = filteredJobs(); const m = can('money');
  const h = ['Job', 'Date', 'Customer', 'Destination', 'Vehicle', 'Driver', 'Delivery status', 'POD', 'Invoice', ...(m ? ['Price', 'Planned cost', 'Actual cost', 'Contribution', 'Cost variance', 'Variance %'] : [])];
  downloadCSV(`jobs-${UI.jobs.from || 'all'}-to-${UI.jobs.to || 'all'}.csv`, h, list.map(j => [j.id, j.date, custName(j.customerId), j.dest, j.vehicleId || 'Subcontract', j.driverId || '', isDone(j) ? (j.late ? 'Late' : 'On time') : statusLabel(j.status), j.pod.status, j.invoice.status, ...(m ? [j.price, j.plannedCost, j.actualCost ?? '', j.actualCost == null ? '' : j.price - j.actualCost, costVar(j) ?? '', j.actualCost == null ? '' : costVarPct(j).toFixed(1)] : [])]));
}
function exportPods() {
  const p = podStats(); const m = can('money');
  const rows = uniq([...p.missing, ...p.uninvoiced]).map(j => [j.id, j.date, custName(j.customerId), j.dest, j.pod.status, j.invoice.status === 'pending' ? (j.pod.status === 'received' ? 'Ready to invoice' : 'Blocked by POD') : j.invoice.status, ...(m ? [j.price] : [])]);
  downloadCSV('pods-and-billing.csv', ['Job', 'Date', 'Customer', 'Destination', 'POD', 'Billing', ...(m ? ['Value'] : [])], rows);
}
function exportInvoices() { downloadCSV('open-invoices.csv', ['Invoice', 'Customer', 'Invoice date', 'Age (days)', 'Bucket', 'Funding eligible', 'Amount'], filteredInvoices().map(i => [i.id, custName(i.customerId), i.date, daysBetween(i.date, TODAY), BUCKETS[bucketOf(i)], i.eligible && bucketOf(i) < 3 ? 'Yes' : 'No', i.amount])); }
function exportActivity() { downloadCSV('activity-log.csv', ['Time', 'Actor', 'Role', 'Action', 'Record type', 'Record', 'Previous', 'New'], S().activity.map(e => { const a = actorLabel(e); return [e.t, a.name, a.role, e.action, e.recordType, e.recordId, safeText(e.prev), safeText(e.next)]; })); }
function printReport() {
  const m = can('money'), y = yesterdayStats(), w = wtdStats(), p = podStats(), t = todayStats();
  const tr = (k, v) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`;
  let h = `<div class="print-h"><div><b style="font-size:18px">${esc(tenantName())} · Morning report</b><div>${fmtDate(TODAY, true)} · ${positionLabel()} · prepared for ${esc(me().name)} (${ROLE_LABEL[myRole()]})</div></div><div>Illustrative demo data · No live systems connected</div></div>`;
  h += `<h2>1. Yesterday · ${fmtDate(YESTERDAY, true)}</h2><table>${tr('Jobs delivered', y.jobs)}${tr('On time', `${y.onTime.length} (${pct(y.onTime.length / y.jobs * 100, 0)})`)}${tr('Late', y.late.map(j => j.id).join(', '))}${m ? tr('Revenue vs target', `${gbp(y.revenue)} vs ${gbp(S().settings.revenueTarget)} (${pct(y.revenue / S().settings.revenueTarget * 100)})`) : ''}</table>`;
  if (m) h += `<h2>2. Costs and contribution</h2><table>${tr('Planned / actual cost', `${gbp(y.planned)} / ${gbp(y.actual)} (${gbp(y.overrun, { sign:true })})`)}${tr('Planned / actual contribution', `${gbp(y.pContrib)} / ${gbp(y.aContrib)}`)}${tr('Planned / actual margin', `${pct(y.pMargin, 2)} / ${pct(y.aMargin, 2)}`)}${tr(`Week to date cost (${wtdLabel()})`, `${gbp(w.planned)} planned / ${gbp(w.actual)} actual (${gbp(w.actual - w.planned, { sign:true })})`)}${tr('Recharge drafts (draft only)', gbp(sum(activeRecharges(), r => r.amount)))}</table>
    <table><thead><tr><th>Flagged job</th><th>Destination</th><th class="num">Planned</th><th class="num">Actual</th><th class="num">Variance</th></tr></thead><tbody>${y.flagged.map(j => `<tr><td>${j.id}</td><td>${esc(j.dest)}</td><td class="num">${gbp(j.plannedCost)}</td><td class="num">${gbp(j.actualCost)}</td><td class="num">${gbp(costVar(j), { sign:true })}</td></tr>`).join('')}</tbody></table>`;
  h += `<h2>PODs and billing</h2><table>${tr('Outstanding PODs', `${p.missing.length} — ${p.missing.map(j => j.id).join(', ')}`)}${tr('Delivered, not invoiced', p.uninvoiced.length)}${tr('Blocked by POD / ready', `${p.blocked.length} / ${p.ready.length}`)}</table>`;
  if (can('cash')) { const d = debtorStats(); h += `<h2>Cash</h2><table>${tr('Total debtors (by invoice date)', gbp(d.total))}${d.buckets.map((b, i) => tr(BUCKETS[i], gbp(b))).join('')}${tr('Estimated Bibby headroom (illustrative)', gbp(d.headroom))}</table>`; }
  h += `<h2>Today</h2><table>${tr('Booked', t.booked)}${tr('Planned cover', `${t.planned}/${t.booked} (${t.confirmed} confirmed, ${t.proposed.length} proposed)`)}${tr('Uncovered', t.uncovered.map(j => j.id).join(', ') || 'None')}</table>`;
  h += `<h2>Requires attention</h2><table>${attentionItems().map(i => `<tr><td>${esc(safeText(i.title))}</td><td>${esc(safeText(i.detail))}</td></tr>`).join('')}</table>`;
  printHTML(m ? h : stripMoney(h));
}

/* ---------- event delegation ---------- */
const ACT = {
  modalClose: () => Modal.close(),
  toggleNav: () => { UI.navOpen = !UI.navOpen; document.querySelector('.shell').classList.toggle('nav-open', UI.navOpen); },
  signIn: async el => {
    const kind = el.dataset.kind, id = el.dataset.id;
    if (kind === 'customer') { Store.setSession({ kind:'customer', contactId:id, via:'direct' }); location.hash = '#/portal'; render(); return; }
    const u = user(id); if (u.status === 'suspended') return toast('This account is suspended.', 'err');
    Store.setSession({ kind:'staff', userId:id });
    if (u.status === 'invited') { u.status = 'active'; log('Accepted invitation', 'user', u.id, 'Invited', 'Active'); Store.save(); }
    UI.crumb = null; location.hash = u.role === 'driver' ? '#/driver-app' : '#/dashboard'; render();
  },
  signOut: () => signOut(),
  resetDemo: () => confirmModal('Reset demo?', 'This restores every record to the initial demonstration state and signs you out. Uploaded POD images are removed.', 'Reset demo', () => { Store.reset(); Object.assign(UI.jobs, { q:'', from:YESTERDAY, to:YESTERDAY, customer:'', vehicle:'', driver:'', dest:'', exc:'', sort:{ key:'id', dir:'asc' } }); saveUI(); UI.crumb = null; location.hash = '#/signin'; render(); toast('Demo reset to its initial state'); }, true),
  go: el => go(el.dataset.href),
  kpiJobs: async el => { const a = el.dataset.arg; if (a === 'clear') setJobFilter('yesterday'); else setJobFilter(a); go('#/jobs'); },
  sort: async el => {
    const t = el.dataset.table, k = el.dataset.key;
    const s = t === 'jobs' ? UI.jobs.sort : (UI.sorts[t] = UI.sorts[t] || { key:'', dir:'asc' });
    if (s.key === k) s.dir = s.dir === 'asc' ? 'desc' : 'asc'; else { s.key = k; s.dir = ['price','planned','actual','variance','amount','age','date'].includes(k) ? 'desc' : 'asc'; }
    if (t === 'jobs') { saveUI(); renderJobsResults(); } else rerender();
  },
  draftRecharge: el => modalDraftRecharge(el.dataset.id),
  editRecharge: el => modalEditRecharge(el.dataset.id),
  cancelRecharge: el => confirmModal('Cancel recharge draft?', 'The draft is kept in history and can be restored.', 'Cancel draft', async () => { await Svc.cancelRecharge(el.dataset.id); toast('Recharge draft cancelled'); rerender(); }),
  restoreRecharge: async el => { try { await Svc.restoreRecharge(el.dataset.id); toast('Recharge draft restored'); rerender(); } catch (e) { toast(e.message, 'err'); } },
  proposeCover: el => modalProposeCover(el.dataset.id),
  withdrawCover: el => confirmModal('Withdraw proposed cover?', 'The job returns to uncovered.', 'Withdraw', async () => { await Svc.withdrawCover(el.dataset.id); toast('Proposal withdrawn'); rerender(); }),
  rigidCheck: el => modalRigids(el.dataset.id),
  raiseAction: el => modalRaiseAction(el.dataset.type, el.dataset.id, el.dataset.preset),
  openAction: el => modalAction(el.dataset.id),
  completeAction: async el => { const n = Modal.el && Modal.el.querySelector('#pn'); await Svc.completeAction(el.dataset.id, n && n.value.trim()); Modal.close(); toast('Action completed'); rerender(); },
  reopenAction: async el => { await Svc.reopenAction(el.dataset.id); Modal.close(); toast('Action reopened'); rerender(); },
  actFilter: async el => { UI.actionsFilter = el.dataset.arg; rerender(); },
  followUp: el => modalFollowUp(el.dataset.id),
  resolveDefect: el => modalResolveDefect(el.dataset.id),
  uploadPod: el => modalUploadPod(el.dataset.id),
  podSampleModal: async el => { pendingPod = samplePod(job(el.dataset.id)); showPodPreview('mpod-prev', 'mpod-submit'); },
  podPaper: async el => { await Svc.podUpload(el.dataset.id, null); Modal.close(); toast(`Paper POD logged for ${el.dataset.id}`); rerender(); },
  share: async el => { try { await Svc.share(el.dataset.job, el.dataset.contact, { pod:true, invoice:false }); toast('Job shared — the contact can now see this job only'); rerender(); } catch (e) { toast(e.message, 'err'); } },
  unshare: el => confirmModal('Stop sharing?', 'The contact will no longer see this job in the customer portal.', 'Stop sharing', async () => { await Svc.unshare(el.dataset.id); toast('Sharing stopped'); rerender(); }),
  sendLink: async el => { const c = contact(el.dataset.contact); if (!c.notify) return toast(`${c.email} has opted out of notifications.`, 'err'); tick(1); await Svc.issueLink(el.dataset.contact, el.dataset.job, 'signin'); Store.save(); toast('One-time link created (simulated) — see the customer mailbox'); rerender(); },
  previewEmail: el => modalEmail(el.dataset.id),
  openLink: async el => { Modal.close(); go('#/link/' + el.dataset.arg); },
  expireLink: async el => { await Svc.expireLink(el.dataset.arg); toast(`Link expired — ${S().settings.linkHours}h demo period simulated`); rerender(); },
  newLink: async el => { const l = S().links.find(x => x.token === el.dataset.arg); await Svc.issueLink(l.contactId, l.jobId, 'signin'); Store.save(); toast('New one-time link created (simulated)'); go('#/mailbox'); },
  planned: el => modalPlanned(el.dataset.arg),
  invite: () => modalInvite(),
  userStatus: async el => { const u = user(el.dataset.id), to = el.dataset.arg; const f = async () => { await Svc.setUserStatus(u.id, to); toast(`${u.name} ${to === 'suspended' ? 'suspended' : 'restored'}`); rerender(); }; to === 'suspended' ? confirmModal(`Suspend ${u.name}?`, 'They will not be able to sign in until restored. Their history is kept.', 'Suspend', f, true) : f(); },
  bucket: async el => { UI.invBucket = el.dataset.arg === 'all' ? null : Number(el.dataset.arg); go('#/cash/invoices'); },
  docCat: async el => { UI.docCat = el.dataset.arg; rerender(); },
  modelPeriod: async el => { UI.modelPeriod = el.dataset.arg; rerender(); },
  modelGroup: async el => { UI.modelGroup = el.dataset.arg; rerender(); },
  drill: async el => {
    const g = el.dataset.grp, k = el.dataset.key;
    if (g === 'job') return go('#/job/' + k);
    setJobFilter('clear'); Object.assign(UI.jobs, { from: el.dataset.from, to: el.dataset.to });
    if (g === 'customer') UI.jobs.customer = k; if (g === 'driver') UI.jobs.driver = k; if (g === 'vehicle') UI.jobs.vehicle = k;
    if (g === 'week') Object.assign(UI.jobs, { from: mondayOf(k) > el.dataset.from ? mondayOf(k) : el.dataset.from, to: addDays(mondayOf(k), 6) < el.dataset.to ? addDays(mondayOf(k), 6) : el.dataset.to });
    saveUI(); go('#/jobs');
  },
  printReport: () => printReport(),
  exportJobs: () => exportJobs(), exportPods: () => exportPods(), exportInvoices: () => exportInvoices(), exportActivity: () => exportActivity(),
  // driver
  driverStage: async el => {
    const id = el.dataset.id, st = el.dataset.arg;
    if (st === 'walkaround') return go('#/driver-app/walkaround/' + id);
    if (st === 'pod') return go('#/driver-app/pod/' + id);
    if (st === 'complete') return confirmModal('Confirm delivery complete?', 'This records the delivery time and notifies the customer. Only confirm once the goods are handed over.', 'Delivery complete', async () => { await Svc.checkin(id, st); toast(`Delivery complete · ${fmtTime(nowIso())}`); rerender(); });
    await Svc.checkin(id, st); toast(`${STAGE_LABEL[st]} · ${fmtTime(nowIso())}`); rerender();
  },
  undoCheckin: async el => { const j = job(el.dataset.id); const u = lastUndo(j); if (!u) return toast('This step can no longer be undone here — contact the transport office.', 'err'); await Svc.undoCheckin(j.id); toast(`Undone: ${STAGE_LABEL[u.stage]}`); rerender(); },
  walkSet: async el => {
    const i = el.dataset.i, v = el.dataset.v, row = el.closest('.m-check');
    row.querySelectorAll('.seg button').forEach(b => { const on = b.dataset.v === v; b.className = on ? (v === 'pass' ? 'on-ok' : 'on-bad') : ''; b.setAttribute('aria-pressed', on); });
    row.querySelector(`input[name=r${i}]`).value = v; document.getElementById('wd' + i).hidden = v !== 'defect';
    const done = [...document.querySelectorAll('form[data-form=walkaround] input[type=hidden]')].filter(x => x.value).length;
    const c = document.getElementById('walk-count'); if (c) c.textContent = `${done} of ${WALK_ITEMS.length}`;
  },
  openMaps: async el => { const j = job(el.dataset.id); Modal.open({ title:'Open in Maps', sub:'Simulated hand-off', body:`<p class="text-2">On a phone this opens the driver's maps app with the delivery postcode <b>${esc(j.address[j.address.length - 1])}</b>.</p><div class="caveat warn mt12">${icon('alert')}<div>This is a fictional demo address with a non-real postcode, so no maps app is opened.</div></div>`, foot:'<button type="button" class="btn btn-primary m-btn" data-act="modalClose">Close</button>' }); },
  podSample: () => { const j = job(parseRoute().parts[2]); pendingPod = samplePod(j); showPodPreview('pod-prev', 'pod-submit'); },
  podSubmit: async el => { if (!pendingPod) return toast('Choose a photo first.', 'err'); try { await Svc.podUpload(el.dataset.id, pendingPod); pendingPod = null; toast('POD submitted'); go('#/driver-app'); } catch (e) { toast(e.message, 'err'); } },
};
function showPodPreview(boxId, btnId) {
  const box = document.getElementById(boxId); if (!box || !pendingPod) return;
  box.innerHTML = `<img class="pod-preview" src="${pendingPod.dataUrl}" alt="POD preview"><div class="small muted mt8">${esc(pendingPod.name)}${pendingPod.size ? ' · ' + Math.round(pendingPod.size / 1024) + ' KB after resizing' : ''}</div>`;
  const b = document.getElementById(btnId); if (b) b.disabled = false;
}
const CHANGE = {
  shareToggle: async el => { await Svc.updateShare(el.dataset.id, el.dataset.key, el.checked); toast(`${el.dataset.key === 'pod' ? 'POD' : 'Invoice'} ${el.checked ? 'visible to' : 'hidden from'} the contact`); rerender(); },
  invCustomer: async el => { UI.invCustomer = el.value; rerender(); },
  notify: async el => { await Svc.setNotify(Store.session.contactId, el.checked); toast(el.checked ? 'Delivery notifications on' : 'You have opted out of delivery notifications'); },
  podFile: async el => { try { pendingPod = await readImage(el.files[0]); showPodPreview('pod-prev', 'pod-submit'); } catch (e) { toast(e.message, 'err'); } },
  podFileModal: async el => { try { pendingPod = await readImage(el.files[0]); showPodPreview('mpod-prev', 'mpod-submit'); } catch (e) { Modal.error(e.message); } },
};
const INPUT = {
  gsearch: el => renderSearchResults(el.value),
  docQ: async el => { UI.docQ = el.value; const q = el.value.toLowerCase(); const list = S().documents.filter(d => (!UI.docCat || d.category === UI.docCat) && (!q || (d.title + d.summary).toLowerCase().includes(q))); document.getElementById('doc-list').innerHTML = docList(list); },
  actFilter: async el => { UI.actFilter = el.value; const f = el.value.toLowerCase(); document.getElementById('act-list').innerHTML = activityTable(S().activity.filter(e => !f || [actorLabel(e).name, e.action, e.recordId, e.next].join(' ').toLowerCase().includes(f))); },
};
const FORMS = {
  walkaround: async (form, fd) => {
    const results = WALK_ITEMS.map((it, i) => ({ item: it, result: fd.get('r' + i), severity: fd.get('sev' + i), note: (fd.get('note' + i) || '').trim() }));
    const unanswered = results.filter(r => !r.result);
    if (unanswered.length) return toast(`Check every item before submitting — ${unanswered.length} still to mark (first: ${unanswered[0].item}).`, 'err');
    const bad = results.find(r => r.result === 'defect' && !r.note);
    if (bad) return toast(`Describe the defect for “${bad.item}”.`, 'err');
    const j = job(form.dataset.id); const w = await Svc.submitWalkaround(j.id, j.vehicleId, results);
    const safety = results.some(r => r.result === 'defect' && r.severity === 'safety');
    toast(w.defects.length ? (safety ? 'Safety-critical defect sent to the transport office. Do not depart.' : 'Walkaround submitted with a minor defect reported') : 'Walkaround complete — no defects');
    go('#/driver-app');
  },
  rates: async (form, fd) => {
    const cur = S().rateCards[S().rateCards.length - 1].rates; const r = {};
    for (const k of Object.keys(cur)) { const v = Number(fd.get(k)); if (!(v >= 0) || fd.get(k) === '') return toast('Every rate needs a number of zero or more.', 'err'); r[k] = v; }
    if (Object.keys(cur).every(k => cur[k] === r[k])) return toast('No rates have changed.', 'err');
    await Svc.publishRates(r, (fd.get('note') || '').trim()); toast('New rate card version published — completed jobs keep their snapshots'); rerender();
  },
  threshold: async (form, fd) => { try { await Svc.setThreshold(fd.get('thr')); toast(`Threshold set to ${threshold()}% — ${S().jobs.filter(isFlagged).length} jobs flagged`); rerender(); } catch (e) { toast(e.message, 'err'); } },
  custFind: async (form, fd) => { const ref = (fd.get('ref') || '').trim().toUpperCase(); if (!ref) return; const sh = custShares().find(s => s.jobId.toUpperCase() === ref || (job(s.jobId).customerRef || '').toUpperCase() === ref); go('#/portal/job/' + encodeURIComponent(sh ? sh.jobId : ref)); },
};
function bindEvents() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el && !el.disabled && !el.classList.contains('is-disabled')) {
      const fn = ACT[el.dataset.act]; if (!fn) return;
      if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'TR' || el.tagName === 'TH') e.preventDefault();
      Promise.resolve().then(() => fn(el, e)).catch(err => { toast(err.message, 'err'); console.error(err); });
      return;
    }
    if (e.target.closest('a.is-disabled')) { e.preventDefault(); return; }
    const res = document.getElementById('gsearch-res');
    if (res && !e.target.closest('.search')) res.hidden = true;
    if (UI.navOpen && e.target.closest('.shell') && !e.target.closest('.sidebar')) { UI.navOpen = false; document.querySelector('.shell').classList.remove('nav-open'); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (Modal.el) Modal.close(); const r = document.getElementById('gsearch-res'); if (r) r.hidden = true; }
    if (e.key === 'Enter' || e.key === ' ') { const el = e.target.closest('tr[data-act], th[data-act]'); if (el && e.target === el) { e.preventDefault(); ACT[el.dataset.act](el, e); } }
    if (e.key === 'Enter' && e.target.id === 'gsearch') { const a = document.querySelector('#gsearch-res .sr-item'); if (a) { e.preventDefault(); location.hash = a.getAttribute('href'); } }
  });
  document.addEventListener('input', e => {
    const b = e.target.dataset.bind;
    if (b) { if (b === 'sort') { const [k, d] = e.target.value.split(':'); UI.jobs.sort = { key:k, dir:d }; } else UI.jobs[b] = e.target.value; saveUI(); renderJobsResults(); return; }
    const a = e.target.dataset.actInput; if (a && INPUT[a]) INPUT[a](e.target);
  });
  document.addEventListener('change', e => { const a = e.target.dataset.actChange; if (a && CHANGE[a]) Promise.resolve().then(() => CHANGE[a](e.target)).catch(err => toast(err.message, 'err')); });
  document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); Promise.resolve().then(() => FORMS[f.dataset.form](f, new FormData(f))).catch(err => toast(err.message, 'err')); });
  window.addEventListener('hashchange', () => { Modal.close(); UI.navOpen = false; onRoute(); });
  window.addEventListener('storage', e => { if (e.key === KEY) { Store.load(); rerender(); } });
}

/* ---------- self-test: reconciles the canonical figures against source rows ---------- */
function selfTest() {
  const y = yesterdayStats(), w = wtdStats(), p = podStats(), d = debtorStats(), t = todayStats(), u = utilisation();
  const checks = [
    ['20 delivered', y.jobs === 20], ['18 on time', y.onTime.length === 18], ['2 late (TH-001, TH-003)', y.late.map(j => j.id).join() === 'TH-001,TH-003'],
    ['Revenue £16,490', y.revenue === 16490], ['Planned cost £10,475', y.planned === 10475], ['Actual cost £11,110', y.actual === 11110],
    ['Overrun £635', y.overrun === 635], ['Planned contribution £6,015', y.pContrib === 6015], ['Actual contribution £5,380', y.aContrib === 5380],
    ['Planned margin 36.48%', y.pMargin.toFixed(2) === '36.48'], ['Actual margin 32.63%', y.aMargin.toFixed(2) === '32.63'],
    ['3 flagged at 10%', threshold() !== 10 || S().jobs.filter(isFlagged).map(j => j.id).join() === 'TH-001,TH-002,TH-003'],
    ['WTD planned £31,225', w.planned === 31225], ['WTD actual £32,120', w.actual === 32120],
    ['Debtors £98,000', d.total === 98000], ['Buckets 28/43/18/9k', d.buckets.join() === '28000,43000,18000,9000'], ['Eligible £80,000', d.eligible === 80000], ['Headroom £17,000', d.headroom === 17000],
    ['Utilisation 49/52', u.worked === 49 && u.avail === 52], ['Miles 9,860 / empty 1,240', u.miles === 9860 && u.empty === 1240],
    ['21 booked today', t.booked === 21],
    ['Cost lines reconcile', S().jobs.filter(j => j.miles != null && isDone(j)).every(j => { const l = costLines(j); return Math.abs(sum(l.planned, x => x.amt) - j.plannedCost) < 0.01 && Math.abs(sum(l.actual, x => x.amt) - j.actualCost) < 0.01; })],
    ['Variance reasons reconcile', S().jobs.filter(j => isDone(j) && j.actualCost != null).every(j => Math.abs(sum(j.variance, v => v.amount) - (j.actualCost - j.plannedCost)) < 0.01)],
  ];
  const fails = checks.filter(c => !c[1]);
  window.__selfTest = { passed: checks.length - fails.length, failed: fails.map(c => c[0]) };
  if (fails.length) console.warn('Data self-test failures:', fails.map(c => c[0])); else console.info(`Data self-test: ${checks.length}/${checks.length} reconciliation checks passed`);
  return window.__selfTest;
}

/* ---------- boot ---------- */
(function boot() {
  if (window.THP_CONFIG && window.THP_CONFIG.mode === 'live') return;
  Store.load();
  bindEvents();
  if (!location.hash) location.replace(Store.session ? '#/dashboard' : '#/signin');
  render();
  selfTest();
})();
