// Daily and Monday report emails: turns a report_digest() result into an email (subject, HTML, plain text).
// Plain JavaScript with no dependencies, so the server function (Deno) and the tests (Node) share it.
// Email programs ignore stylesheets, so every style is written inline, and the layout uses tables.

const C = {
  navy: '#0B1324', bg: '#F3F5F9', card: '#FFFFFF', line: '#E3E7EF', text: '#0F172A', text2: '#334155', muted: '#64748B',
  accent: '#2F6BFF',
  red: '#DC2626', redSoft: '#FDECEC', redText: '#B91C1C',
  amber: '#F59E0B', amberSoft: '#FEF4E2', amberText: '#B45309',
  green: '#16A34A', greenSoft: '#E7F7EC', greenText: '#15803D',
  grey: '#94A3B8', greySoft: '#F1F4F8', greyText: '#64748B',
};
const FONT = `font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const QUADS = [['hs', 'Health and Safety'], ['service', 'Service'], ['cost', 'Cost'], ['people', 'People'], ['compliance', 'Compliance']];
const STATUS = {
  red: ['Red', C.red, C.redSoft, C.redText], amber: ['Amber', C.amber, C.amberSoft, C.amberText],
  green: ['Green', C.green, C.greenSoft, C.greenText], stale: ['Not updated', C.grey, C.greySoft, C.greyText],
  no_data: ['No data', C.grey, C.greySoft, C.greyText], no_target: ['No target', C.grey, C.greySoft, C.greyText],
};
const SOURCES = { jobs: 'jobs', job_costs: 'job costs', warehouse_days: 'warehouse figures', staff: 'staff list', people_events: 'holiday and absence',
  incidents: 'accidents and near misses', infringements: 'drivers’ hours', compliance_items: 'compliance dates', defects: 'vehicle defects',
  pnl: 'profit and loss', payroll: 'payroll', revenue_plan: 'revenue plan' };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (v, dp = 0) => (v < 0 ? '−' : '') + '£' + Math.abs(Number(v)).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const fmtValue = (v, unit) => v == null ? '—' : unit === '%' ? `${Number(v).toFixed(1)}%` : unit === '£' ? money(v, 2) : Number(v).toLocaleString('en-GB');
const fmtDate = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' }) : '';
const longDate = d => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const targetText = m => m.green_at == null ? 'No target set' : `Target ${m.better === 'higher' ? '≥' : '≤'} ${fmtValue(m.green_at, m.unit)}`;
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

function counts(d) {
  const ms = d.measures || [];
  return { red: ms.filter(m => m.status === 'red').length, amber: ms.filter(m => m.status === 'amber').length,
    green: ms.filter(m => m.status === 'green').length, stale: ms.filter(m => m.status === 'stale').length };
}
function summaryLine({ red, amber }) {
  if (!red && !amber) return 'all figures on target';
  return [red && `${red} red`, amber && `${amber} amber`].filter(Boolean).join(', ');
}

// ---------------------------------------------------------------- building blocks
const pill = status => {
  const [label, dot, soft, text] = STATUS[status] || STATUS.no_data;
  return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${soft};color:${text};font-size:12px;font-weight:600;white-space:nowrap">`
    + `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dot};margin-right:6px;vertical-align:1px"></span>${label}</span>`;
};
const section = (title, inner, note = '') => `
<tr><td style="padding:22px 28px 0">
  <div style="${FONT};font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};margin:0 0 10px">${esc(title)}</div>
  ${inner}
  ${note ? `<div style="${FONT};font-size:12.5px;color:${C.muted};margin-top:8px">${note}</div>` : ''}
</td></tr>`;
const table = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${C.line};border-radius:10px">${rows}</table>`;
const row = (cells, last) => `<tr>${cells.map(([html, style = '']) => `<td style="${FONT};font-size:14px;color:${C.text};padding:11px 14px;${last ? '' : `border-bottom:1px solid ${C.line};`}${style}">${html}</td>`).join('')}</tr>`;

function quadrantStrip(d) {
  const cells = QUADS.filter(([q]) => d.quadrants?.[q] && d.quadrants[q].status !== 'no_access').map(([q, name]) => {
    const st = d.quadrants[q].status;
    const [, dot, soft, text] = STATUS[st] || STATUS.no_data;
    return `<td align="center" style="padding:4px"><div style="background:${soft};border-radius:10px;padding:12px 6px">
      <div style="width:12px;height:12px;border-radius:50%;background:${dot};margin:0 auto 6px"></div>
      <div style="${FONT};font-size:12px;font-weight:650;color:${text}">${esc(name)}</div></div></td>`;
  });
  return cells.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells.join('')}</tr></table>` : '';
}

function measureRows(list) {
  return table(list.map((m, i) => row([
    [`<div style="font-weight:600">${esc(m.name)}</div><div style="font-size:12.5px;color:${C.muted};margin-top:2px">${esc(targetText(m))}${m.scope && m.scope !== 'all' ? ` · ${esc(m.scope)}` : ''}</div>`],
    [`<span style="font-weight:700;font-size:15px">${esc(fmtValue(m.value, m.unit))}</span>`, 'text-align:right;white-space:nowrap'],
    [pill(m.status), 'text-align:right;width:1%'],
  ], i === list.length - 1)).join(''));
}

function staleNotice(d) {
  const s = (d.stale_sources || []).map(x => SOURCES[x] || x);
  if (!s.length) return '';
  return `<tr><td style="padding:18px 28px 0"><div style="${FONT};background:${C.greySoft};border:1px solid ${C.line};border-radius:10px;padding:12px 14px;font-size:13.5px;color:${C.text2}">`
    + `<strong>Not updated:</strong> ${esc(s.join(', '))}. Figures from these feeds are marked “Not updated” rather than coloured, until the connection catches up.</div></td></tr>`;
}

function actionRows(list) {
  if (!list?.length) return '';
  return section('Your actions', table(list.map((a, i) => row([
    [`<span style="color:${C.muted};font-size:12.5px">${esc(a.ref)}</span><br>${esc(a.title)}`],
    [a.overdue ? `<span style="color:${C.redText};font-weight:650">Overdue</span><br><span style="font-size:12.5px;color:${C.muted}">was due ${esc(fmtDate(a.due_date))}</span>`
               : `Due ${esc(fmtDate(a.due_date))}`, 'text-align:right;white-space:nowrap;font-size:13.5px'],
  ], i === list.length - 1)).join('')));
}

function commentRows(d) {
  const list = d.comments || [];
  if (!list.length) return '';
  const name = code => (d.measures || []).find(m => m.code === code)?.name || code;
  return section('Notes on these figures', list.map(c => `<div style="${FONT};border-left:3px solid ${C.accent};padding:4px 0 4px 12px;margin:0 0 10px">
    <div style="font-size:12.5px;color:${C.muted}">${esc(c.author)} on ${esc(name(c.target))}</div>
    <div style="font-size:14px;color:${C.text};margin-top:2px">${esc(c.body)}</div></div>`).join(''));
}

function weekRows(d) {
  const trend = d.trend || {};
  const list = (d.measures || []).filter(m => trend[m.code]?.length);
  if (!list.length) return '';
  const sq = st => { const [, dot] = STATUS[st] || STATUS.no_data; return `<td style="padding:0 2px"><div style="width:14px;height:14px;border-radius:4px;background:${dot}"></div></td>`; };
  return section('The last 7 days', table(list.map((m, i) => {
    const pts = trend[m.code];
    const reds = pts.filter(p => p.status === 'red').length;
    const vals = pts.map(p => p.value).filter(v => v != null);
    const change = vals.length > 1 ? Number(vals[vals.length - 1]) - Number(vals[0]) : null;
    const dir = change == null || change === 0 || m.green_at == null ? '' : ((change > 0) === (m.better === 'higher') ? '▲ better' : '▼ worse');
    return row([
      [`<div style="font-weight:600">${esc(m.name)}</div><div style="font-size:12.5px;color:${C.muted};margin-top:2px">${reds ? `${plural(reds, 'red day')}` : 'No red days'}${dir ? ` · ${dir}` : ''}</div>`],
      [`<table role="presentation" cellpadding="0" cellspacing="0" align="right"><tr>${pts.map(p => sq(p.status)).join('')}</tr></table>`, 'text-align:right'],
      [`<span style="font-weight:700">${esc(fmtValue(m.value, m.unit))}</span>`, 'text-align:right;white-space:nowrap;width:1%'],
    ], i === list.length - 1);
  }).join('')), 'Each square is one day, oldest first: green, amber, red, or grey for no data.');
}

function weekActions(d) {
  const w = d.week;
  if (!w) return '';
  const tile = (n, label, colour) => `<td style="padding:4px" width="25%"><div style="background:${C.bg};border-radius:10px;padding:12px;text-align:center">
    <div style="${FONT};font-size:22px;font-weight:750;color:${colour}">${Number(n)}</div><div style="${FONT};font-size:12px;color:${C.muted}">${label}</div></div></td>`;
  return section('Actions this week', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${tile(w.raised, 'Raised', C.text)}${tile(w.completed, 'Completed', C.greenText)}${tile(w.open, 'Open', C.text)}${tile(w.overdue, 'Overdue', w.overdue ? C.redText : C.text)}</tr></table>`);
}

function shell({ preheader, heading, sub, body, appUrl, d }) {
  const link = `${appUrl.replace(/\/$/, '')}/`;
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.card};border-radius:14px;overflow:hidden">
  <tr><td style="background:${C.navy};padding:20px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="${FONT};font-size:19px;font-weight:800;color:#FFFFFF;letter-spacing:-.02em"><span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:${C.accent};vertical-align:-5px;margin-right:9px"></span>Clearpath</td>
      <td align="right" style="${FONT};font-size:13px;color:#C7D0E0">${esc(d.company || '')}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:26px 28px 0">
    <div style="${FONT};font-size:22px;font-weight:750;color:${C.text};letter-spacing:-.02em">${esc(heading)}</div>
    <div style="${FONT};font-size:14px;color:${C.text2};margin-top:6px">${sub}</div>
  </td></tr>
  <tr><td style="padding:18px 24px 0">${quadrantStrip(d)}</td></tr>
  ${body}
  <tr><td align="center" style="padding:28px 28px 8px">
    <a href="${esc(link)}" style="${FONT};display:inline-block;background:${C.accent};color:#FFFFFF;font-weight:650;font-size:15px;text-decoration:none;padding:12px 26px;border-radius:10px">Open Clearpath</a>
  </td></tr>
  <tr><td style="padding:18px 28px 26px">
    <div style="${FONT};font-size:12px;color:${C.muted};line-height:1.5;border-top:1px solid ${C.line};padding-top:14px">
      This email shows only the figures your login can see. You'll need your password and authenticator code to open the full detail.
      To stop these emails, go to My account in Clearpath. Please don't reply: this address isn't monitored.
    </div>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ---------------------------------------------------------------- the two emails
export function renderDaily(d, { appUrl }) {
  const c = counts(d);
  const attention = (d.measures || []).filter(m => m.status === 'red' || m.status === 'amber')
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'red' ? -1 : 1));
  const headlines = (d.measures || []).filter(m => m.headline && m.status !== 'red' && m.status !== 'amber');
  const age = d.day && d.today ? daysBetween(d.day, d.today) : 0;
  const when = !d.day ? 'No figures yet' : age <= 1 ? `Figures for ${longDate(d.day)}` : `Latest figures are for ${longDate(d.day)} (${age} days ago)`;
  const subject = `${d.company} daily: ${summaryLine(c)} · ${fmtDate(d.day)}`;
  const sub = `Good morning ${esc(firstName(d.name))}. ${esc(when)}: ${esc(summaryLine(c))}.`;
  const body = [
    staleNotice(d),
    attention.length ? section('Needs attention', measureRows(attention)) : section('Needs attention', `<div style="${FONT};font-size:14px;color:${C.greenText}">Nothing is red or amber.</div>`),
    headlines.length ? section('Headline figures', measureRows(headlines)) : '',
    commentRows(d),
    actionRows(d.my_actions),
  ].join('');
  const html = shell({ preheader: `${summaryLine(c)}. ${when}.`, heading: `Daily report`, sub, body, appUrl, d });
  const text = [
    `${d.company}: daily report`, `${when}: ${summaryLine(c)}.`, '',
    ...(d.stale_sources?.length ? [`Not updated: ${d.stale_sources.map(x => SOURCES[x] || x).join(', ')}.`, ''] : []),
    'Needs attention:', ...(attention.length ? attention.map(m => `- ${m.name}: ${fmtValue(m.value, m.unit)} (${STATUS[m.status][0]}; ${targetText(m)})`) : ['- Nothing is red or amber.']),
    ...(d.my_actions?.length ? ['', 'Your actions:', ...d.my_actions.map(a => `- ${a.ref} ${a.title}: ${a.overdue ? 'overdue, was due' : 'due'} ${fmtDate(a.due_date)}`)] : []),
    '', `Open Clearpath: ${appUrl.replace(/\/$/, '')}/`, '', 'To stop these emails, go to My account in Clearpath.',
  ].join('\n');
  return { subject, html, text };
}

export function renderWeekly(d, { appUrl }) {
  const c = counts(d);
  const from = d.day ? new Date(new Date(d.day + 'T12:00:00Z').getTime() - 6 * 864e5).toISOString().slice(0, 10) : null;
  const range = d.day ? `${fmtDate(from, { day: 'numeric', month: 'short' })} to ${fmtDate(d.day, { day: 'numeric', month: 'short' })}` : '';
  const subject = `${d.company} week ${range}: ${summaryLine(c)}`;
  const sub = `Good morning ${esc(firstName(d.name))}. Here's how last week went. Latest figures: ${esc(summaryLine(c))}.`;
  const body = [staleNotice(d), weekRows(d), weekActions(d), actionRows(d.my_actions)].join('');
  const html = shell({ preheader: `Week ${range}: ${summaryLine(c)}.`, heading: `Week ${range}`, sub, body, appUrl, d });
  const trend = d.trend || {};
  const text = [
    `${d.company}: week ${range}`, `Latest figures: ${summaryLine(c)}.`, '',
    ...(d.measures || []).filter(m => trend[m.code]?.length).map(m => `- ${m.name}: ${fmtValue(m.value, m.unit)}; ${trend[m.code].filter(p => p.status === 'red').length} red days`),
    ...(d.week ? ['', `Actions: ${d.week.raised} raised, ${d.week.completed} completed, ${d.week.open} open, ${d.week.overdue} overdue.`] : []),
    '', `Open Clearpath: ${appUrl.replace(/\/$/, '')}/`, '', 'To stop these emails, go to My account in Clearpath.',
  ].join('\n');
  return { subject, html, text };
}

export const render = (d, opts) => (d.kind === 'weekly' ? renderWeekly : renderDaily)(d, opts);

// Runs one batch: asks the database who is due, builds each email, sends it, records the outcome.
// db.rpc(name, args) and send({ to, subject, html, text, idempotencyKey }) are passed in, so the same
// code runs on the server and in the tests.
export async function runReports({ db, send, appUrl, limit = 50 }) {
  const due = (await db.rpc('report_due', {})) || [];
  const results = [];
  for (const r of due.slice(0, limit)) {
    const key = `${r.kind}-${r.company_id}-${r.user_id}-${r.period}`;
    try {
      const d = await db.rpc('report_digest', { p_user: r.user_id, p_kind: r.kind });
      if (!d?.day || !(d.measures || []).length) {
        await db.rpc('record_report_send', { p_company: r.company_id, p_user: r.user_id, p_kind: r.kind, p_period: r.period, p_status: 'skipped', p_detail: 'No figures this person can see' });
        results.push({ key, status: 'skipped' }); continue;
      }
      const mail = render(d, { appUrl });
      const id = await send({ to: r.email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: key });
      await db.rpc('record_report_send', { p_company: r.company_id, p_user: r.user_id, p_kind: r.kind, p_period: r.period, p_status: 'sent', p_provider_id: id || null });
      results.push({ key, status: 'sent' });
    } catch (e) {
      await db.rpc('record_report_send', { p_company: r.company_id, p_user: r.user_id, p_kind: r.kind, p_period: r.period, p_status: 'failed', p_detail: String(e?.message || e) }).catch(() => {});
      results.push({ key, status: 'failed' });
    }
  }
  return { due: due.length, results };
}
