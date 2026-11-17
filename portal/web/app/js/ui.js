// Shared screen pieces: formatting, status pills, tables, dialogs, messages and the bullseye.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const QUAD = { hs: 'Health and Safety', service: 'Service', cost: 'Cost', people: 'People', compliance: 'Compliance' };
export const STATUS = { green: 'On target', amber: 'Watch', red: 'Action needed', no_data: 'Waiting for data', no_target: 'Target not set', stale: 'Not updated', no_access: 'No access' };
const COLOR = { green: 'var(--ok)', amber: '#D99A1E', red: 'var(--bad)', no_data: '#BDBBB4', no_target: 'var(--info)', stale: '#BDBBB4', no_access: '#BDBBB4' };
const FILL = { green: 'var(--ok-soft)', amber: 'var(--warn-soft)', red: 'var(--bad-soft)', no_data: 'var(--none-soft)', no_target: 'var(--info-soft)', stale: 'var(--none-soft)', no_access: '#FAFAF8' };

// Line icons (drawn for Clearpath, 24px grid).
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11.5h13V9"/><path d="M10 20.5v-6h4v6"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  truck: '<path d="M2.5 6.5h11v9.5h-11z"/><path d="M13.5 9.5h4l3.5 3.8v2.7h-7.5"/><circle cx="6.5" cy="17.5" r="1.9"/><circle cx="17" cy="17.5" r="1.9"/>',
  chart: '<path d="M3 20.5h18"/><path d="M6 17V11"/><path d="M11 17V5.5"/><path d="M16 17v-7"/><path d="M20 17v-3.5"/>',
  people: '<circle cx="9" cy="8" r="3.3"/><path d="M2.8 20c.4-3.4 3-5.8 6.2-5.8s5.8 2.4 6.2 5.8"/><path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4"/><path d="M17.8 14.6c1.9.8 3.1 2.8 3.4 5.4"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="m9 13 2.2 2.2L15.5 11"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 14.8h18M9.5 9.5V20"/>',
  link: '<path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1"/>',
  sliders: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1.6"/><rect x="3" y="13" width="18" height="7" rx="1.6"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20.5c.5-3.6 3.4-6 7-6s6.5 2.4 7 6"/>',
  signout: '<path d="M14.5 4h3.5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5"/><path d="M9.5 8 5.5 12l4 4M5.5 12H15"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.2M12 16.2h.01"/>',
  plug: '<path d="M9 3v5M15 3v5"/><path d="M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0V8Z"/><path d="M12 17v4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevron: '<path d="m9.5 6 6 6-6 6"/>',
};
export const icon = name => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export const pill = (s, label) => `<span class="pill s-${esc(s)}">${esc(label || STATUS[s] || s)}</span>`;
export const fmtValue = (v, unit) => v == null ? '—' : unit === '%' ? `${Number(v).toFixed(1)}%` : unit === '£' ? money(v, 2) : Number(v).toLocaleString('en-GB');
export const money = (v, dp = 0) => v == null ? '—' : (v < 0 ? '−' : '') + '£' + Math.abs(Number(v)).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const date = d => d ? new Date(d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : '—';
export const dateTime = d => d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '—';
export const time = d => d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '—';
/** Today's date in the UK (YYYY-MM-DD). */
export const todayUK = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
export const target = m => m.green_at == null ? 'No target set yet' : `Green ${m.better === 'higher' ? 'at or above' : 'at or below'} ${fmtValue(m.green_at, m.unit)}; amber ${m.better === 'higher' ? 'at or above' : 'at or below'} ${fmtValue(m.amber_at, m.unit)}`;
export const label = s => String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

/** A table. cols: [{ label, cell: row => html, num?: true }]. Empty state says what would appear. */
export function table(rows, cols, empty) {
  if (!rows.length) return `<p class="empty">${esc(empty)}</p>`;
  return `<div class="tbl"><table><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${r._cls || ''}">${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.cell(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function measureRows(measures) {
  if (!measures.length) return `<p class="empty">No figures you can see here.</p>`;
  return measures.map(m => `<div class="m"><div class="nm">${esc(m.name)}<small>${esc(target(m))}${m.scope !== 'all' ? ` · ${esc(m.scope)} figures only` : ''}</small></div>
    <div class="v">${fmtValue(m.value, m.unit)}</div><div>${pill(m.status)}</div></div>`).join('');
}

export function bullseye(q, selected) {
  const cx = 210, cy = 210, R = 196, r = 84;
  const pt = (rad, deg) => [cx + rad * Math.cos(deg * Math.PI / 180), cy + rad * Math.sin(deg * Math.PI / 180)];
  const wedge = (a1, a2, key) => {
    const s = q[key].status; const [x1, y1] = pt(R, a1 + 2), [x2, y2] = pt(R, a2 - 2), [x3, y3] = pt(r, a2 - 2), [x4, y4] = pt(r, a1 + 2);
    const [lx, ly] = pt((R + r) / 2, (a1 + a2) / 2);
    return `<a href="#/${key}" class="wedge" aria-label="${QUAD[key]}: ${STATUS[s]}">
      <path d="M${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 0 0 ${x4} ${y4}Z" fill="${FILL[s]}" stroke="${COLOR[s]}" stroke-width="${selected === key ? 3 : 1.5}" ${s === 'no_access' ? 'stroke-dasharray="5 4"' : ''}/>
      <text x="${lx}" y="${ly - 4}" text-anchor="middle" font-weight="650" font-size="15" fill="var(--text)">${QUAD[key]}</text>
      <text x="${lx}" y="${ly + 14}" text-anchor="middle" font-size="12" font-weight="500" fill="var(--muted)">${STATUS[s]}${q[key].incomplete && s !== 'no_access' ? ' *' : ''}</text></a>`;
  };
  const h = q.hs.status;
  return `<svg class="bull" viewBox="0 0 420 420" role="img" aria-label="Health and Safety ${STATUS[h]}; Service ${STATUS[q.service.status]}; Cost ${STATUS[q.cost.status]}; People ${STATUS[q.people.status]}; Compliance ${STATUS[q.compliance.status]}">
    ${wedge(-90, 0, 'service')}${wedge(0, 90, 'compliance')}${wedge(90, 180, 'people')}${wedge(180, 270, 'cost')}
    <a href="#/hs" class="wedge" aria-label="Health and Safety: ${STATUS[h]}">
      <circle cx="${cx}" cy="${cy}" r="${r - 8}" fill="${FILL[h]}" stroke="${COLOR[h]}" stroke-width="1.75"/>
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-weight="650" font-size="15" fill="var(--text)">Health and</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-weight="650" font-size="15" fill="var(--text)">Safety</text>
      <text x="${cx}" y="${cy + 32}" text-anchor="middle" font-size="12" font-weight="500" fill="var(--muted)">${STATUS[h]}</text></a></svg>`;
}

// ---------------------------------------------------------------- messages and dialogs
export function toast(msg, kind = 'ok') {
  const t = document.createElement('div'); t.className = `toast toast-${kind}`; t.setAttribute('role', kind === 'error' ? 'alert' : 'status'); t.textContent = msg;
  document.getElementById('toasts').append(t); setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3500);
}

/** A form in a dialog. fields: [{ name, label, type, options?, value?, required?, hint? }]. onSubmit(values) may throw to show an error. */
export function dialog({ title, intro = '', fields, submit, onSubmit }) {
  const d = document.createElement('dialog'); d.className = 'dlg';
  const field = f => {
    const id = 'f-' + f.name; const req = f.required ? 'required' : '';
    const input = f.type === 'select' ? `<select id="${id}" name="${f.name}" ${req}>${f.options.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(f.value ?? '') ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
      : f.type === 'textarea' ? `<textarea id="${id}" name="${f.name}" rows="3" ${req}>${esc(f.value ?? '')}</textarea>`
      : f.type === 'checkbox' ? `<input id="${id}" name="${f.name}" type="checkbox" ${f.value ? 'checked' : ''}>`
      : `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.step ? `step="${f.step}"` : ''} ${req}>`;
    return `<label class="fld ${f.type === 'checkbox' ? 'chk' : ''}" for="${id}"><span>${esc(f.label)}</span>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
  };
  d.innerHTML = `<form method="dialog" novalidate><h2>${esc(title)}</h2>${intro ? `<p class="sub">${intro}</p>` : ''}<div class="fields">${fields.map(field).join('')}</div>
    <p class="form-error" role="alert" hidden></p><div class="actions"><button type="button" class="btn ghost" value="cancel">Cancel</button><button type="submit" class="btn primary">${esc(submit)}</button></div></form>`;
  document.body.append(d); d.showModal();
  const form = d.querySelector('form'); const err = d.querySelector('.form-error');
  d.querySelector('[value=cancel]').onclick = () => { d.close(); d.remove(); };
  d.addEventListener('cancel', () => d.remove());
  form.onsubmit = async e => {
    e.preventDefault(); err.hidden = true;
    const missing = fields.filter(f => f.required && !String(form.elements[f.name].value || '').trim());
    if (missing.length) { err.textContent = `Fill in: ${missing.map(f => f.label).join(', ')}.`; err.hidden = false; return; }
    const values = Object.fromEntries(fields.map(f => [f.name, f.type === 'checkbox' ? form.elements[f.name].checked : form.elements[f.name].value.trim()]));
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try { await onSubmit(values); d.close(); d.remove(); }
    catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  };
}

/** Pseudonymise people's names when the signed-in person has switched on demo view. */
export function namer(on) {
  const seen = new Map();
  return (id, name, kind = 'Employee') => {
    if (!on) return name;
    if (!seen.has(id)) seen.set(id, seen.size + 1);
    return `${kind} ${seen.get(id)}`;
  };
}
