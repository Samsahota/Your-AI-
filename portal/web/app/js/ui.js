// Shared screen pieces: formatting, status pills, tables, dialogs, messages and the bullseye.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const QUAD = { hs: 'Health and Safety', service: 'Service', cost: 'Cost', people: 'People', compliance: 'Compliance' };
export const STATUS = { green: 'On target', amber: 'Watch', red: 'Action needed', no_data: 'Waiting for data', no_target: 'Target not set', stale: 'Not updated', no_access: 'No access' };
// Status colours (charts and the bullseye) and each area's own colour.
const COLOR = { green: '#16A34A', amber: '#F59E0B', red: '#DC2626', no_data: '#CBD5E1', no_target: '#2F6BFF', stale: '#CBD5E1', no_access: '#E2E8F0' };
const FILL = { green: '#E7F7EC', amber: '#FEF4E2', red: '#FDECEC', no_data: '#F4F6FA', no_target: '#EAF0FF', stale: '#F4F6FA', no_access: '#FAFBFD' };
export const HUE = { hs: '#4F46E5', service: '#0891B2', cost: '#7C3AED', people: '#0D9488', compliance: '#2563EB' };
export const QICON = { hs: 'shield', service: 'truck', cost: 'chart', people: 'people', compliance: 'clipboard' };
export const statusColour = s => COLOR[s] || COLOR.no_data;

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
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  trend: '<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
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

export function measureRows(measures, { raise = false } = {}) {
  if (!measures.length) return `<p class="empty">No figures you can see here.</p>`;
  return measures.map(m => `<div class="m"><div class="nm">${esc(m.name)}<small>${esc(target(m))}${m.scope !== 'all' ? ` · ${esc(m.scope)} figures` : ''}</small></div>
    <div class="v"><b class="${m.value == null ? 'wait' : ''}">${fmtValue(m.value, m.unit)}</b>${pill(m.status)}</div>${gauge(m)}
    ${raise && (m.status === 'red' || m.status === 'amber') ? `<div class="acts">${raiseBtn({ area: m.quadrant, title: `${m.name} is ${STATUS[m.status].toLowerCase()} at ${fmtValue(m.value, m.unit)}`, linkKind: 'measure', linkId: m.code, linkLabel: m.name, priority: m.status === 'red' ? 'high' : 'medium' })}</div>` : ''}</div>`).join('');
}

export function bullseye(q, selected) {
  const cx = 210, cy = 210, R = 194, r = 86;
  const pt = (rad, deg) => [cx + rad * Math.cos(deg * Math.PI / 180), cy + rad * Math.sin(deg * Math.PI / 180)];
  const wedge = (a1, a2, key) => {
    const s = q[key].status; const [x1, y1] = pt(R, a1 + 1.6), [x2, y2] = pt(R, a2 - 1.6), [x3, y3] = pt(r + 6, a2 - 2.4), [x4, y4] = pt(r + 6, a1 + 2.4);
    const [lx, ly] = pt((R + r) / 2 + 6, (a1 + a2) / 2); const [ix, iy] = pt(R - 4, (a1 + a2) / 2);
    return `<a href="#/${key}" class="wedge" aria-label="${QUAD[key]}: ${STATUS[s]}">
      <path d="M${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r + 6} ${r + 6} 0 0 0 ${x4} ${y4}Z" fill="${FILL[s]}" stroke="${COLOR[s]}" stroke-width="${selected === key ? 3 : 1.6}" ${s === 'no_access' ? 'stroke-dasharray="5 4"' : ''}/>
      <circle cx="${lx}" cy="${ly - 34}" r="5" fill="${HUE[key]}"/>
      <text x="${lx}" y="${ly - 6}" text-anchor="middle" font-weight="700" font-size="15.5" fill="#0F172A">${QUAD[key]}</text>
      <text x="${lx}" y="${ly + 14}" text-anchor="middle" font-size="12" font-weight="600" fill="${s === 'no_data' || s === 'stale' || s === 'no_access' ? '#64748B' : COLOR[s]}">${STATUS[s]}${q[key].incomplete && s !== 'no_access' ? ' *' : ''}</text></a>`;
  };
  const h = q.hs.status;
  return `<svg class="bull" viewBox="0 0 420 420" role="img" aria-label="Health and Safety ${STATUS[h]}; Service ${STATUS[q.service.status]}; Cost ${STATUS[q.cost.status]}; People ${STATUS[q.people.status]}; Compliance ${STATUS[q.compliance.status]}">
    <circle cx="${cx}" cy="${cy}" r="${R + 10}" fill="none" stroke="#EEF1F6" stroke-width="1.5"/>
    ${wedge(-90, 0, 'service')}${wedge(0, 90, 'compliance')}${wedge(90, 180, 'people')}${wedge(180, 270, 'cost')}
    <a href="#/hs" class="wedge" aria-label="Health and Safety: ${STATUS[h]}">
      <circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="#fff" stroke="${COLOR[h]}" stroke-width="2.5"/>
      <circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="${FILL[h]}"/>
      <circle cx="${cx}" cy="${cy - 40}" r="5" fill="${HUE.hs}"/>
      <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-weight="700" font-size="15.5" fill="#0F172A">Health and</text>
      <text x="${cx}" y="${cy + 9}" text-anchor="middle" font-weight="700" font-size="15.5" fill="#0F172A">Safety</text>
      <text x="${cx}" y="${cy + 30}" text-anchor="middle" font-size="12" font-weight="600" fill="${h === 'no_data' || h === 'stale' ? '#64748B' : COLOR[h]}">${STATUS[h]}</text></a></svg>`;
}

// ---------------------------------------------------------------- brand mark and charts
/** The Clearpath mark: a road narrowing to the horizon, in a rounded tile. */
export const logo = () => `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="cpg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B7BFF"/><stop offset="1" stop-color="#1F4FD8"/></linearGradient></defs>
  <rect width="32" height="32" rx="9" fill="url(#cpg)"/><path d="M9 25 14.2 8h3.6L23 25" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16 22.5v-2.6M16 16.6v-2M16 11.5v-1.3" stroke="#9EF0E6" stroke-width="2" stroke-linecap="round"/></svg>`;

/** A small trend line. points: [{ value, status }], oldest first. */
export function sparkline(points = [], status = 'no_data') {
  const pts = points.filter(p => p.value != null);
  const W = 120, H = 38;
  if (pts.length < 2) return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="M2 ${H - 6}H${W - 2}" stroke="#CBD5E1" stroke-width="2" stroke-dasharray="3 5" stroke-linecap="round"/></svg>`;
  const vs = pts.map(p => Number(p.value)); const lo = Math.min(...vs), hi = Math.max(...vs); const span = hi - lo || 1;
  const xy = pts.map((p, i) => [2 + i * (W - 6) / (pts.length - 1), H - 5 - (Number(p.value) - lo) / span * (H - 12)]);
  const line = xy.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('');
  const c = statusColour(status === 'no_data' ? pts[pts.length - 1].status : status); const [ex, ey] = xy[xy.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${line}L${ex.toFixed(1)} ${H}L2 ${H}Z" fill="${c}" fill-opacity=".1"/>
    <path d="${line}" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.4" fill="#fff" stroke="${c}" stroke-width="2.2"/></svg>`;
}

/** A ring made of coloured segments (e.g. how many figures are green, amber, red). */
export function ring(segments, { label = '', sub = '', size = 64 } = {}) {
  const r = 26, C = 2 * Math.PI * r; const total = segments.reduce((t, s) => t + s.value, 0);
  let off = 0;
  const arcs = total ? segments.filter(s => s.value > 0).map(s => { const len = s.value / total * C; const a = `<circle cx="32" cy="32" r="${r}" fill="none" stroke="${s.colour}" stroke-width="7" stroke-dasharray="${Math.max(len - 2, 0.5).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 32 32)" stroke-linecap="butt"/>`; off += len; return a; }).join('') : '';
  return `<svg class="ring" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><circle cx="32" cy="32" r="${r}" fill="none" stroke="#EEF1F6" stroke-width="7"/>${arcs}
    <text x="32" y="${sub ? 33 : 37}" text-anchor="middle" font-size="${String(label).length > 4 ? 11 : 14}" font-weight="750" fill="#0F172A">${esc(label)}</text>${sub ? `<text x="32" y="44" text-anchor="middle" font-size="8.5" fill="#64748B">${esc(sub)}</text>` : ''}</svg>`;
}

/** How a figure sits against its target, as a filled bar (full = at or better than green). */
export function gauge(m) {
  const W = 300, H = 6; const v = m.value == null ? null : Number(m.value); const g = m.green_at == null ? null : Number(m.green_at), a = m.amber_at == null ? null : Number(m.amber_at);
  let f = 0;
  if (v != null && g != null) {
    if (m.better === 'higher') f = g > 0 ? v / g : 1;
    else f = v <= g ? 1 : a != null && a > g ? Math.max(.12, 1 - (v - g) / ((a - g) * 2)) : .25;
  } else if (v != null) f = .5;
  f = Math.max(0, Math.min(1, f));
  return `<svg class="gauge" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><rect width="${W}" height="${H}" rx="3" fill="#EEF1F6"/>${f > 0 ? `<rect width="${(f * W).toFixed(1)}" height="${H}" rx="3" fill="${statusColour(m.status)}"/>` : ''}</svg>`;
}

/** A thin progress bar in SVG (no inline styles: the security policy forbids them). */
export const meter = (fraction, from = '#2F6BFF', to = '#4FD1C5') => {
  const f = Math.max(0, Math.min(1, fraction || 0));
  return `<svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="mtr" x1="0" x2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="100" height="6" rx="3" fill="rgba(255,255,255,.1)"/>${f ? `<rect width="${(f * 100).toFixed(1)}" height="6" rx="3" fill="url(#mtr)"/>` : ''}</svg>`;
};

/** Daily bars for one figure, with its green target as a dashed line. points: [{ day, value, status }]. */
export function barChart(points = [], { unit = '', target = null, emptyTitle = 'Waiting for data', emptyText = 'Bars appear here once this figure has a few days of data.' } = {}) {
  const W = 640, H = 220, L = 46, R = 12, T = 14, B = 30; const iw = W - L - R, ih = H - T - B;
  const vals = points.filter(p => p.value != null).map(p => Number(p.value));
  const grid = n => Array.from({ length: n + 1 }, (_, i) => T + ih * i / n);
  if (!vals.length) {
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(emptyTitle)}">${grid(4).map(y => `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#EEF1F6"/>`).join('')}
      ${Array.from({ length: 14 }, (_, i) => { const bw = iw / 14 * .56; const x = L + iw / 14 * i + (iw / 14 - bw) / 2; const h = ih * (.25 + .5 * Math.abs(Math.sin(i * 1.7))); return `<rect x="${x.toFixed(1)}" y="${(T + ih - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="#F1F4F8"/>`; }).join('')}
      <text x="${L + iw / 2}" y="${T + ih / 2 - 4}" text-anchor="middle" font-size="15" font-weight="650" fill="#334155">${esc(emptyTitle)}</text>
      <text x="${L + iw / 2}" y="${T + ih / 2 + 16}" text-anchor="middle" font-size="12.5" fill="#64748B">${esc(emptyText)}</text></svg>`;
  }
  const hi = Math.max(...vals, target ?? 0) * 1.12 || 1; const lo = Math.min(0, ...vals);
  const y = v => T + ih - (v - lo) / (hi - lo) * ih; const n = points.length; const slot = iw / n; const bw = Math.min(34, slot * .6);
  const fmt = v => unit === '%' ? `${Math.round(v)}%` : unit === '£' ? `£${Math.round(v).toLocaleString('en-GB')}` : Math.round(v * 10) / 10;
  const ticks = [0, .25, .5, .75, 1].map(f => lo + (hi - lo) * f);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily values">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#EEF1F6"/><text x="${L - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#94A3B8">${fmt(t)}</text>`).join('')}
    ${points.map((p, i) => { const x = L + slot * i + (slot - bw) / 2; const lbl = new Date(p.day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const bar = p.value == null ? '' : `<rect x="${x.toFixed(1)}" y="${y(Math.max(Number(p.value), lo)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, y(lo) - y(Number(p.value))).toFixed(1)}" rx="4" fill="${statusColour(p.status)}"><title>${esc(lbl)}: ${fmt(Number(p.value))}</title></rect>`;
      return bar + (n <= 16 || i % 2 === 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10.5" fill="#94A3B8">${esc(lbl)}</text>` : ''); }).join('')}
    ${target != null ? `<line x1="${L}" x2="${W - R}" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" stroke="#16A34A" stroke-width="1.6" stroke-dasharray="5 4"/><text x="${W - R}" y="${(y(target) - 6).toFixed(1)}" text-anchor="end" font-size="11" font-weight="650" fill="#15803D">Target ${fmt(target)}</text>` : ''}
  </svg>`;
}

/** An icon in a coloured tile. kind: an area (hs, service...), a status (green, amber, red, none) or 'actions'. */
export const iconTile = (name, kind = '', size = '') => `<span class="ic ${esc(kind)} ${esc(size)}">${icon(name)}</span>`;

/** A figure as a tile: name, value, target, colour bar, trend line. */
export function figureTile(m, trend = [], href = `#/${m.quadrant}`) {
  return `<a class="tile ts-${esc(m.status)}" href="${href}"><div class="top"><span class="l">${esc(m.name)}</span>${iconTile(QICON[m.quadrant], m.quadrant, 'sm')}</div>
    <span class="n ${m.value == null ? 'wait' : ''}">${fmtValue(m.value, m.unit)}</span><span class="t">${esc(target(m))}</span>
    <div class="bottom">${pill(m.status)}${sparkline(trend, m.status)}</div></a>`;
}

/** A "Raise action" button; actions.js picks up the click anywhere on the page. */
export const raiseBtn = (preset, label = 'Raise action', cls = 'small') => `<button class="btn raise ${cls}" type="button" data-raise="${esc(JSON.stringify(preset))}">${icon('flag')}${esc(label)}</button>`;

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
