// Pure helpers shared by edge functions. No Deno or network APIs here, so they can be unit-tested in Node.

/** RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF, BOM. Returns array of row objects keyed by header. */
export function parseCSV(text: string): Record<string, string>[] {
  text = text.replace(/^﻿/, '');
  const rows: string[][] = []; let row: string[] = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; if (row.some(x => x !== '')) rows.push(row); row = [];
    } else f += c;
  }
  row.push(f); if (row.some(x => x !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** UK money: "£1,234.50", "1234.5", "(120.00)" → number; blank → null. Throws on garbage. */
export function money(v: string | undefined | null): number | null {
  if (v == null || String(v).trim() === '') return null;
  let s = String(v).trim(); const neg = /^\(.*\)$/.test(s) || s.startsWith('-') || s.startsWith('−');
  s = s.replace(/[()£,\s−-]/g, '');
  const n = Number(s); if (!isFinite(n)) throw new Error(`Not a money value: "${v}"`);
  return neg ? -n : n;
}

/** Dates: ISO (2026-11-04), UK (04/11/2026, 4/11/26), or Xero's /Date(1730678400000+0000)/. */
export function ukDate(v: string | undefined | null): string | null {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim();
  const ms = s.match(/\/Date\((\d+)([+-]\d{4})?\)\//); if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  throw new Error(`Not a date: "${v}"`);
}

export function hhmm(v: string | undefined | null): string | null {
  if (!v) return null; const m = String(v).match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/** Import profiles: which CSV columns are required and how each row maps to database rows. */
export type ImportKind = 'jobs' | 'invoices' | 'funding' | 'compliance' | 'routes';
export const IMPORT_SPECS: Record<ImportKind, { required: string[]; describe: string }> = {
  jobs: { required: ['job', 'date', 'customer', 'destination', 'slot'], describe: 'Vigo job export: job, date, customer, destination, slot, vehicle, driver, status, delivered_at, price, planned_cost, actual_cost, pallets, miles, pod_status, invoice_number' },
  invoices: { required: ['invoice', 'customer', 'date', 'amount'], describe: 'Xero aged receivables / invoice export: invoice, customer, date, due_date, amount (outstanding), status' },
  funding: { required: ['as_at', 'advance_rate', 'facility_ceiling', 'drawn'], describe: 'Bibby statement: as_at, advance_rate (e.g. 85 or 0.85), facility_ceiling, drawn' },
  compliance: { required: ['driver', 'kind', 'title', 'due'], describe: 'Tachomaster export: driver, kind (licence|tacho|cpc), title, detail, due, status' },
  routes: { required: ['job', 'planned_miles'], describe: 'Paragon route plan: job, planned_miles, planned_minutes' },
};

export function checkColumns(kind: ImportKind, rows: Record<string, string>[]): string[] {
  if (!rows.length) return ['The file has no data rows.'];
  const have = Object.keys(rows[0]);
  return IMPORT_SPECS[kind].required.filter(c => !have.includes(c)).map(c => `Missing column "${c}".`);
}

const STATUS: Record<string, string> = { 'not started': 'not_started', booked: 'not_started', planned: 'not_started', 'en route': 'en_route', 'in transit': 'en_route', 'on site': 'on_site', arrived: 'on_site', delivered: 'delivered', completed: 'delivered', complete: 'delivered' };

/** Maps one job CSV row to jobs + job_financials rows. Pure; throws a readable error for a bad row. */
export function mapJobRow(r: Record<string, string>, customerIdFor: (name: string) => string) {
  const status = STATUS[(r.status || 'not started').toLowerCase()] ?? 'not_started';
  const delivered = hhmm(r.delivered_at);
  const slot = hhmm(r.slot); if (!slot) throw new Error(`Job ${r.job}: slot must be HH:MM`);
  const job = {
    id: r.job, date: ukDate(r.date)!, dest: r.destination, customer_id: customerIdFor(r.customer), customer_ref: r.customer_ref || null,
    vehicle_id: r.vehicle || null, driver_id: r.driver || null, slot, status,
    delivered_at: status === 'delivered' ? delivered : null, late: status === 'delivered' && delivered ? delivered > slot : null,
    pallets: r.pallets ? Number(r.pallets) : null, miles: r.miles ? Number(r.miles) : null, actual_miles: r.actual_miles ? Number(r.actual_miles) : (r.miles ? Number(r.miles) : null),
    pod_status: status === 'delivered' ? (/^(y|yes|received|true)$/i.test(r.pod_status || '') ? 'received' : 'missing') : 'n/a',
    invoice_status: status !== 'delivered' ? 'not_due' : (r.invoice_number ? 'invoiced' : 'pending'), invoice_id: r.invoice_number || null,
    src: 'import',
  };
  const price = money(r.price), planned = money(r.planned_cost);
  const fin = price != null && planned != null ? { job_id: r.job, price, planned_cost: planned, actual_cost: money(r.actual_cost) } : null;
  return { job, fin };
}

/** Xero invoice JSON → invoices row (ACCREC only). */
export function mapXeroInvoice(x: any, customerIdFor: (contactId: string, name: string) => string) {
  if (x.Type !== 'ACCREC' || !['AUTHORISED', 'PAID'].includes(x.Status)) return null;
  return {
    id: x.InvoiceNumber || x.InvoiceID, customer_id: customerIdFor(x.Contact?.ContactID, x.Contact?.Name),
    date: ukDate(x.DateString || x.Date), due_date: ukDate(x.DueDateString || x.DueDate),
    amount: Number(x.Status === 'PAID' ? x.Total : x.AmountDue), status: x.Status === 'PAID' ? 'paid' : 'outstanding', source: 'xero', synthetic: false,
  };
}

export function escapeHtml(s: string) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]); }

export function deliveryEmail(o: { contactName: string; jobId: string; ref: string; dest: string; deliveredAt: string | null; link: string; hours: number; company: string }) {
  const subject = `Delivered: ${o.ref || o.jobId} to ${o.dest}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1D1D1B;max-width:560px">
<p>Hello ${escapeHtml(o.contactName)},</p>
<p>Your delivery <b>${escapeHtml(o.ref || o.jobId)}</b> (${escapeHtml(o.company)} job ${escapeHtml(o.jobId)}) to <b>${escapeHtml(o.dest)}</b> has been completed${o.deliveredAt ? ' at ' + escapeHtml(o.deliveredAt) : ''}.</p>
<p>View the delivery status and proof of delivery using the secure link below. It works once and expires after ${o.hours} hours.</p>
<p><a href="${escapeHtml(o.link)}" style="display:inline-block;background:#ED1C24;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">View delivery</a></p>
<p style="font-size:12px;color:#6E6D68">You receive these emails because ${escapeHtml(o.company)} shared this delivery with you. You can turn notifications off in the portal.</p></div>`;
  return { subject, html };
}
