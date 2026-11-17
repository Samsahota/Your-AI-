// Connection engine: the part every connector shares. Plain JavaScript with no dependencies,
// so the same code runs in tests (Node) and in Supabase edge functions (Deno).
//
// The path every figure takes (build pack, "How connecting a system works"):
//   raw input -> parse -> check the columns are still there -> map to standard records
//   -> run checks against the source's own totals -> only then write.
// If anything fails, nothing is written and the run is recorded as failed, so the
// dashboard shows "not updated" rather than a wrong number.

/** Parse CSV text (RFC 4180: quoted fields, commas and new lines inside quotes, a leading BOM). */
export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/** Turn parsed rows into objects keyed by header, after finding the header row. */
export function toObjects(rows, { headerRow = 0 } = {}) {
  const headers = (rows[headerRow] || []).map(h => h.trim());
  return { headers, items: rows.slice(headerRow + 1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}

/** Every column the mapping needs must exist. A renamed column is the most common way a feed breaks. */
export function checkHeaders(headers, mapping) {
  const needed = new Set();
  for (const f of Object.values(mapping.fields)) for (const c of [].concat(f.from)) needed.add(c);
  const missing = [...needed].filter(c => !headers.includes(c));
  return { name: 'columns present', expected: [...needed], actual: headers, passed: missing.length === 0,
    message: missing.length ? `Column${missing.length > 1 ? 's' : ''} missing: ${missing.join(', ')}. Has the report layout changed?` : null };
}

const BOOL = { yes: true, y: true, true: true, '1': true, no: false, n: false, false: false, '0': false };

/** Convert one cell to the type the standard record needs. Throws a readable error. */
export function convert(raw, f) {
  const v = Array.isArray(raw) ? raw.map(x => String(x ?? '').trim()).join(' ').trim() : String(raw ?? '').trim();
  if (v === '') { if (f.required) throw new Error('is empty'); return null; }
  switch (f.type || 'text') {
    case 'text': return v;
    case 'int': { if (!/^-?\d+$/.test(v.replace(/,/g, ''))) throw new Error(`"${v}" is not a whole number`); return parseInt(v.replace(/,/g, ''), 10); }
    case 'number':
    case 'money': {
      const neg = /^\(.*\)$/.test(v);                       // accounting negatives: (123.45)
      const n = Number(v.replace(/[£$€,\s()]/g, ''));
      if (!Number.isFinite(n)) throw new Error(`"${v}" is not a number`);
      return f.type === 'money' ? Math.round((neg ? -n : n) * 100) / 100 : (neg ? -n : n);
    }
    case 'bool': {
      const b = BOOL[v.toLowerCase()];
      if (b === undefined) throw new Error(`"${v}" is not yes or no`);
      return f.invert ? !b : b;
    }
    case 'date': return parseDate(v, f.format);
    case 'datetime': return parseDateTime(v, f.format, f.timezone || 'Europe/London');
    default: throw new Error(`unknown type ${f.type}`);
  }
}

function parseDate(v, format = 'DD/MM/YYYY') {
  let y, m, d;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(v);
  if (iso) [, y, m, d] = iso.map(Number);
  else if (uk && format.startsWith('DD')) { [, d, m, y] = uk.map(Number); if (y < 100) y += 2000; }
  else if (uk && format.startsWith('MM')) { [, m, d, y] = uk.map(Number); if (y < 100) y += 2000; }
  else throw new Error(`"${v}" is not a date`);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new Error(`"${v}" is not a real date`);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// UK local time to an ISO timestamp with the correct offset (GMT or BST).
function parseDateTime(v, format, tz) {
  const date = parseDate(v, format);
  const t = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(v);
  if (!t) throw new Error(`"${v}" has no time`);
  const [hh, mm, ss] = [Number(t[1]), Number(t[2]), Number(t[3] || 0)];
  if (hh > 23 || mm > 59) throw new Error(`"${v}" is not a real time`);
  const naive = Date.UTC(...date.split('-').map((n, i) => i === 1 ? Number(n) - 1 : Number(n)), hh, mm, ss);
  const offset = tzOffsetMinutes(naive, tz);
  return new Date(naive - offset * 60000).toISOString();
}

function tzOffsetMinutes(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(utcMs)).reduce((o, p) => (o[p.type] = p.value, o), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/**
 * Map source rows to standard records.
 * mapping = { target: 'jobs', key: 'job_ref', skipWhen?: { column, equals }, fields: { job_ref: { from: 'Job No', type: 'text', required: true }, ... } }
 * Returns { records, errors } where each error names the row (as the user sees it in Excel) and the column.
 */
export function mapRows(items, mapping, { firstDataRow = 2 } = {}) {
  const records = []; const errors = [];
  items.forEach((item, i) => {
    if (mapping.skipWhen && String(item[mapping.skipWhen.column] ?? '').trim().toLowerCase() === String(mapping.skipWhen.equals).toLowerCase()) return;
    const rec = {}; let ok = true;
    for (const [target, f] of Object.entries(mapping.fields)) {
      const raw = Array.isArray(f.from) ? f.from.map(c => item[c]) : item[f.from];
      try { rec[target] = convert(raw, f); }
      catch (e) { ok = false; errors.push({ row: i + firstDataRow, column: [].concat(f.from).join(' + '), problem: e.message }); }
    }
    if (ok) records.push(rec);
  });
  return { records, errors };
}

/**
 * Checks that must all pass before anything is written.
 *  - every row mapped without errors
 *  - no duplicate keys
 *  - row count matches the source's own count, when the report states one
 *  - totals match the source's own totals (e.g. the report footer, or Xero's total), to the penny
 */
export function runChecks({ records, errors, key, control = {} }) {
  const checks = [];
  checks.push({ name: 'rows readable', expected: 0, actual: errors.length, passed: errors.length === 0,
    message: errors.length ? `${errors.length} row${errors.length > 1 ? 's' : ''} could not be read, first: row ${errors[0].row}, ${errors[0].column}: ${errors[0].problem}` : null });
  if (key) {
    const seen = new Set(); const dups = new Set();
    for (const r of records) { const k = r[key]; if (seen.has(k)) dups.add(k); seen.add(k); }
    checks.push({ name: 'no duplicates', expected: 0, actual: dups.size, passed: dups.size === 0,
      message: dups.size ? `Duplicate ${key}: ${[...dups].slice(0, 5).join(', ')}` : null });
  }
  if (control.rowCount != null) {
    checks.push({ name: 'row count matches source', expected: control.rowCount, actual: records.length, passed: records.length === control.rowCount,
      message: records.length === control.rowCount ? null : `Source says ${control.rowCount} rows, we read ${records.length}` });
  }
  for (const [field, expected] of Object.entries(control.totals || {})) {
    const actual = Math.round(records.reduce((s, r) => s + (Number(r[field]) || 0), 0) * 100) / 100;
    const passed = Math.abs(actual - expected) < 0.005;
    checks.push({ name: `total ${field} matches source`, expected, actual, passed,
      message: passed ? null : `Source total for ${field} is ${expected}, our total is ${actual}` });
  }
  return { passed: checks.every(c => c.passed), checks };
}

/** The whole pipeline for a file or emailed report. Returns what record_run() needs. */
export function processCsv(text, mapping, control = {}) {
  const rows = parseCsv(text);
  const { headers, items } = toObjects(rows, { headerRow: mapping.headerRow || 0 });
  const headerCheck = checkHeaders(headers, mapping);
  if (!headerCheck.passed) return { status: 'check_failed', rowsIn: items.length, records: [], checks: [headerCheck], error: headerCheck.message };
  const { records, errors } = mapRows(items, mapping, { firstDataRow: (mapping.headerRow || 0) + 2 });
  const { passed, checks } = runChecks({ records, errors, key: mapping.key, control });
  const all = [headerCheck, ...checks];
  return { status: passed ? 'ok' : 'check_failed', rowsIn: items.length, records: passed ? records : [], errors, checks: all,
    error: passed ? null : all.find(c => !c.passed).message };
}

/** sha256 of the raw input, stored with the run so any figure can be traced back to the exact file. */
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
