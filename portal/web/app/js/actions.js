// Actions: raise an action against a figure or record, give it an owner, priority and follow-up date,
// record progress, complete or reopen it. Internal to Clearpath: nothing is written back to source systems.
import { rpc } from './api.js';
import { auth } from './api.js';
import { esc, pill, date, dateTime, toast, icon, iconTile, table, dialog, todayUK, addDays, QUAD } from './ui.js';
import { ctx, q, level, refresh } from './app.js';

export const PRIORITY = { high: ['red', 'High'], medium: ['amber', 'Medium'], low: ['no_data', 'Low'] };
const AREA = { ...QUAD, records: 'Records', settings: 'Settings', payroll: 'Payroll', pnl: 'Company P&L', people_detail: 'Disciplinary and grievance' };
const LINK = { measure: 'Figure', incident: 'Incident', compliance_item: 'Compliance item', defect: 'Defect', infringement: 'Infringement', job: 'Job', vehicle: 'Vehicle', staff: 'Staff', connection: 'Connection', document: 'Document' };

export const myId = () => auth.user()?.id || null;
export const isOverdue = a => a.status === 'open' && a.due_date < todayUK();
export const priorityPill = p => pill(PRIORITY[p][0], PRIORITY[p][1]);
export const statusPill = a => a.status === 'done' ? pill('green', 'Completed') : isOverdue(a) ? pill('red', 'Overdue') : pill('no_target', 'Open');

/** Every action this person can see (open ones and the last 60 completed). */
export async function loadActions() {
  if (!ctx.company) { ctx.actions = []; return; }
  const [open, done] = await Promise.all([
    q('actions', { status: 'eq.open', order: 'due_date.asc' }),
    q('actions', { status: 'eq.done', order: 'closed_at.desc', limit: 60 }),
  ]);
  ctx.actions = [...open, ...done];
}
export const counts = () => {
  const open = (ctx.actions || []).filter(a => a.status === 'open'); const me = myId();
  return { open: open.length, overdue: open.filter(isOverdue).length, mine: open.filter(a => a.owner === me).length,
    mineOverdue: open.filter(a => a.owner === me && isOverdue(a)).length, dueWeek: open.filter(a => a.due_date <= addDays(todayUK(), 7)).length,
    doneMonth: (ctx.actions || []).filter(a => a.status === 'done' && a.closed_at && a.closed_at.slice(0, 10) >= addDays(todayUK(), -30)).length };
};

// ---------------------------------------------------------------- raise
/** preset: { area, division?, title?, linkKind?, linkId?, linkLabel?, priority? } */
export async function raiseAction(preset = {}) {
  const areas = Object.keys(AREA).filter(a => level(a) !== 'none');
  if (!areas.length) return toast('Your login cannot raise actions.', 'error');
  const area = preset.area && areas.includes(preset.area) ? preset.area : null;
  const owners = await rpc('action_owners', { p_area: area || areas[0], p_division: preset.division || null, p_company: ctx.isAdmin ? ctx.company : null });
  const me = myId();
  dialog({
    title: 'Raise action',
    intro: `Internal action, tracked in Clearpath. It is never written back to Vigo, Xero or any other system.${preset.linkLabel ? `<br><span class="linked">${icon('link')}${esc(LINK[preset.linkKind] || 'Linked')}: ${esc(preset.linkLabel)}</span>` : ''}`,
    submit: 'Raise action',
    fields: [
      { name: 'title', label: 'What needs to happen?', value: preset.title || '', required: true },
      ...(area ? [] : [{ name: 'area', label: 'Area', type: 'select', options: areas.map(a => [a, AREA[a]]), value: areas[0], required: true }]),
      { name: 'owner', label: 'Owner', type: 'select', options: owners.map(o => [o.user_id, o.name]), value: owners.some(o => o.user_id === me) ? me : owners[0]?.user_id, required: true,
        hint: 'Only people who can see this area are listed.' },
      { name: 'priority', label: 'Priority', type: 'select', options: [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], value: preset.priority || 'medium' },
      { name: 'due', label: 'Follow-up date', type: 'date', value: addDays(todayUK(), preset.priority === 'high' ? 2 : 7), required: true },
      { name: 'notes', label: 'Notes', type: 'textarea', hint: 'Why it matters, what has been tried, who else is involved.' },
    ],
    onSubmit: async v => {
      const r = await rpc('raise_action', { p_area: area || v.area, p_title: v.title, p_owner: v.owner, p_due: v.due, p_priority: v.priority, p_notes: v.notes || null,
        p_link_kind: preset.linkKind || 'none', p_link_id: preset.linkId || null, p_link_label: preset.linkLabel || null, p_division: preset.division || null,
        p_company: ctx.isAdmin ? ctx.company : null });
      toast(`Action ${r.ref} raised`);
      await refresh();
    },
  });
}

// ---------------------------------------------------------------- one action: details, timeline, progress
export async function openAction(id) {
  const a = (ctx.actions || []).find(x => x.id === id); if (!a) return;
  const updates = await q('action_updates', { action_id: `eq.${a.id}`, order: 'at.asc' });
  const me = myId(); const manager = ctx.isAdmin || ['director', 'operations', 'consultant'].includes(ctx.profile.role);
  const canEdit = a.owner === me || a.created_by === me || manager;
  const WHAT = { raised: 'Raised', progress: 'Progress', completed: 'Completed', reopened: 'Reopened', reassigned: 'Changed' };
  const d = document.createElement('dialog'); d.className = 'dlg wide';
  d.innerHTML = `<div class="dlg-body">
    <div class="page-head"><div class="title">${iconTile('flag', 'actions')}<div><p class="eyebrow">${esc(a.ref)} · ${esc(AREA[a.area] || a.area)}</p><h2>${esc(a.title)}</h2></div></div></div>
    <div class="meta">${statusPill(a)}${priorityPill(a.priority)}<span class="linked">${icon('user')}${esc(ctx.name(a.owner, a.owner_name, 'Owner'))}</span>
      <span class="linked ${isOverdue(a) ? 'overdue' : ''}">${icon('calendar')}Follow-up ${date(a.due_date)}</span>
      ${a.link_label ? `<span class="linked">${icon('link')}${esc(LINK[a.link_kind] || 'Linked')}: ${esc(a.link_label)}</span>` : ''}</div>
    <ul class="timeline">${updates.map(u => `<li><span class="td ${esc(u.kind)}"></span><div><b>${esc(WHAT[u.kind])} · ${esc(ctx.name(u.by_user, u.by_name, 'Team member'))}</b>${u.note ? `<p>${esc(u.note)}</p>` : ''}</div><time>${dateTime(u.at)}</time></li>`).join('')}</ul>
    ${canEdit && a.status === 'open' ? `<label class="fld" for="act-note"><span>Record progress</span><textarea id="act-note" rows="3" placeholder="What has happened?"></textarea></label>` : ''}
    <p class="form-error" role="alert" hidden></p>
    <div class="actions"><button class="btn ghost" type="button" data-x="close">Close</button>
      ${!canEdit ? '' : a.status === 'open'
        ? `<button class="btn" type="button" data-x="reassign">${icon('user')}Change owner or date</button><button class="btn" type="button" data-x="completed">${icon('check')}Mark complete</button><button class="btn primary" type="button" data-x="progress">Add progress</button>`
        : `<button class="btn primary" type="button" data-x="reopened">Reopen</button>`}</div></div>`;
  document.body.append(d); d.showModal();
  const err = d.querySelector('.form-error'); const close = () => { d.close(); d.remove(); };
  d.addEventListener('cancel', () => d.remove());
  d.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
    const x = b.dataset.x; if (x === 'close') return close();
    if (x === 'reassign') { close(); return reassign(a); }
    const note = d.querySelector('#act-note')?.value.trim() || null;
    if (x === 'progress' && !note) { err.textContent = 'Say what has happened first.'; err.hidden = false; return; }
    b.disabled = true;
    try {
      await rpc('update_action', { p_action: a.id, p_kind: x, p_note: note });
      toast(x === 'completed' ? `${a.ref} completed` : x === 'reopened' ? `${a.ref} reopened` : 'Progress recorded');
      close(); await refresh();
    } catch (e) { err.textContent = e.message; err.hidden = false; b.disabled = false; }
  });
}

async function reassign(a) {
  const owners = await rpc('action_owners', { p_area: a.area, p_division: a.division, p_company: ctx.isAdmin ? ctx.company : null });
  dialog({ title: `Change owner or follow-up date: ${a.ref}`, submit: 'Save', fields: [
    { name: 'owner', label: 'Owner', type: 'select', options: owners.map(o => [o.user_id, o.name]), value: a.owner },
    { name: 'due', label: 'Follow-up date', type: 'date', value: a.due_date },
    { name: 'note', label: 'Why (optional)', type: 'textarea' }],
  onSubmit: async v => {
    await rpc('update_action', { p_action: a.id, p_kind: 'reassigned', p_note: v.note || null, p_owner: v.owner !== a.owner ? v.owner : null, p_due: v.due !== a.due_date ? v.due : null });
    toast(`${a.ref} updated`); await refresh();
  } });
}

// ---------------------------------------------------------------- lists
export function actionRows(list, empty = 'No actions.') {
  if (!list.length) return `<div class="empty-state">${iconTile('check', 'green')}<b>${esc(empty)}</b><span>Raise an action from any red or amber figure, incident or record.</span></div>`;
  return `<ul class="rows">${list.map(a => `<li class="link" data-open-action="${a.id}" tabindex="0" role="button" aria-label="Open action ${esc(a.ref)}">
    <span class="dot ${a.status === 'done' ? 'green' : isOverdue(a) ? 'red' : a.priority === 'high' ? 'amber' : ''}"></span>
    <div class="tx"><b>${esc(a.title)}</b><small>${esc(a.ref)} · ${esc(ctx.name(a.owner, a.owner_name, 'Owner'))} · follow-up <span class="${isOverdue(a) ? 'overdue' : ''}">${date(a.due_date)}</span>${a.link_label ? ` · ${esc(a.link_label)}` : ''}</small></div>
    <div class="side-info">${priorityPill(a.priority)}${statusPill(a)}</div></li>`).join('')}</ul>`;
}

export function actionsTable(list) {
  return table(list.map(a => ({ ...a, _cls: isOverdue(a) ? 'row-bad' : '' })), [
    { label: 'Action', cell: a => `<span class="strong">${esc(a.title)}</span><span class="subl">${esc(a.ref)}${a.link_label ? ` · ${esc(LINK[a.link_kind] || '')}: ${esc(a.link_label)}` : ''}</span>` },
    { label: 'Area', cell: a => esc(AREA[a.area] || a.area) },
    { label: 'Owner', cell: a => esc(ctx.name(a.owner, a.owner_name, 'Owner')) },
    { label: 'Priority', cell: a => priorityPill(a.priority) },
    { label: 'Follow-up', cell: a => `<span class="${isOverdue(a) ? 'overdue' : ''}">${date(a.due_date)}</span>` },
    { label: 'Status', cell: a => statusPill(a) },
    { label: '', cell: a => `<button class="btn small" type="button" data-open-action="${a.id}">Open</button>` },
  ], 'No actions match.');
}

/** The Actions page: summary tiles, filters (segmented control and area drop-down) and the list. */
export async function actionsPage(main) {
  const c = counts(); const me = myId();
  const f = ctx.actionFilter || (c.mine ? 'mine' : 'open'); const areaF = ctx.actionArea || '';
  const all = ctx.actions || [];
  const pick = { mine: a => a.status === 'open' && a.owner === me, open: a => a.status === 'open', overdue: isOverdue, done: a => a.status === 'done', all: () => true }[f];
  const list = all.filter(pick).filter(a => !areaF || a.area === areaF);
  const areas = [...new Set(all.map(a => a.area))];
  const stat = (ic, kind, l, n, foot) => `<div class="card stat">${iconTile(ic, kind, 'lg')}<div class="tx"><div class="l">${l}</div><div class="n">${n}</div><div class="f">${foot}</div></div></div>`;
  main.innerHTML = `<header class="page-head"><div class="title">${iconTile('flag', 'actions', 'lg')}<div><h1>Actions</h1><p class="sub">Who is doing what about every red and amber, and by when. Internal to Clearpath.</p></div></div>
      <div class="head-actions"><button class="btn primary" type="button" data-raise="{}">${icon('flag')}Raise action</button></div></header>
    <div class="stats">${stat('user', 'actions', 'Assigned to me', c.mine, c.mineOverdue ? `<b class="bad">${c.mineOverdue} overdue</b>` : 'None overdue')}
      ${stat('list', '', 'Open', c.open, `${c.dueWeek} due in the next 7 days`)}${stat('alert', c.overdue ? 'red' : 'none', 'Overdue', c.overdue, c.overdue ? 'Past their follow-up date' : 'Everything on time')}
      ${stat('check', 'green', 'Completed', c.doneMonth, 'In the last 30 days')}</div>
    <section class="card flush"><div class="card-head toolbar"><div class="seg" role="group" aria-label="Show">${[['mine', 'Mine', c.mine], ['open', 'All open', c.open], ['overdue', 'Overdue', c.overdue], ['done', 'Completed', null], ['all', 'All', null]]
        .map(([k, l, n]) => `<button type="button" data-f="${k}" class="${f === k ? 'on' : ''}" aria-pressed="${f === k}">${l}${n != null ? `<span class="count">${n}</span>` : ''}</button>`).join('')}</div>
      <label class="ctl" for="act-area"><span class="sr">Area</span><select class="select" id="act-area"><option value="">All areas</option>${areas.map(a => `<option value="${a}" ${a === areaF ? 'selected' : ''}>${esc(AREA[a] || a)}</option>`).join('')}</select></label></div>
      <div class="card-body">${actionsTable(list)}</div></section>`;
  main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { ctx.actionFilter = b.dataset.f; actionsPage(main); });
  main.querySelector('#act-area').onchange = e => { ctx.actionArea = e.target.value; actionsPage(main); };
}

/** An area page's actions card. */
export function areaActionsCard(area, preset = {}) {
  const list = (ctx.actions || []).filter(a => a.area === area && a.status === 'open');
  return `<section class="card flush"><div class="card-head"><div class="t">${iconTile('flag', 'actions', 'sm')}<h2>Open actions (${list.length})</h2></div>
    <div class="head-actions"><a href="#/actions">All actions</a><button class="btn raise small" type="button" data-raise="${esc(JSON.stringify({ area, ...preset }))}">${icon('flag')}Raise action</button></div></div>
    ${actionRows(list, 'No open actions here.')}</section>`;
}

// One listener for the whole app: any [data-raise] button raises an action, any [data-open-action] opens one.
let installed = false;
export function installActionHandlers() {
  if (installed) return; installed = true;
  const go = el => {
    const r = el.closest('[data-raise]'); if (r) { let p = {}; try { p = JSON.parse(r.dataset.raise || '{}'); } catch (e) { p = {}; } raiseAction(p).catch(x => toast(x.message, 'error')); return true; }
    const o = el.closest('[data-open-action]'); if (o) { openAction(o.dataset.openAction).catch(x => toast(x.message, 'error')); return true; }
    return false;
  };
  document.addEventListener('click', e => { if (go(e.target)) e.preventDefault(); });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('li[data-open-action]')) { e.preventDefault(); go(e.target); } });
}
