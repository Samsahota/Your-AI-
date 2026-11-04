// Unit tests for the import/mapping logic used by the edge functions (compiled from TypeScript on the fly).
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { buildSync } from 'esbuild'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const out = path.join(os.tmpdir(), 'thp-pure.mjs');
buildSync({ entryPoints: [new URL('../supabase/functions/_shared/pure.ts', import.meta.url).pathname], outfile: out, format: 'esm', bundle: true, logLevel: 'error' });
const P = await import(out + '?' + Date.now());

test('CSV: quotes, commas, CRLF, BOM, header normalisation', () => {
  const rows = P.parseCSV('﻿Job,Customer Name,Notes\r\nTH-1,"Brookline, Ltd","He said ""hi"""\r\n\r\nTH-2,X,\n');
  assert.deepEqual(rows, [{ job: 'TH-1', customer_name: 'Brookline, Ltd', notes: 'He said "hi"' }, { job: 'TH-2', customer_name: 'X', notes: '' }]);
});
test('money and dates', () => {
  assert.equal(P.money('£1,234.50'), 1234.5); assert.equal(P.money('(120.00)'), -120); assert.equal(P.money(''), null);
  assert.throws(() => P.money('abc'), /Not a money value/);
  assert.equal(P.ukDate('04/11/2026'), '2026-11-04'); assert.equal(P.ukDate('4/11/26'), '2026-11-04'); assert.equal(P.ukDate('2026-11-04T10:00'), '2026-11-04');
  assert.equal(P.ukDate('/Date(1793750400000+0000)/'), new Date(1793750400000).toISOString().slice(0, 10));
  assert.throws(() => P.ukDate('next tuesday'), /Not a date/);
});
test('job row mapping: late detection, POD, invoice state, financials', () => {
  const { job, fin } = P.mapJobRow({ job: 'TH-001', date: '04/11/2026', customer: 'Northfield', destination: 'Leeds', slot: '9:30', status: 'Delivered', delivered_at: '11:05', price: '£1,450', planned_cost: '920', actual_cost: '1190', pod_status: 'no' }, n => 'C01');
  assert.equal(job.slot, '09:30'); assert.equal(job.late, true); assert.equal(job.pod_status, 'missing'); assert.equal(job.invoice_status, 'pending');
  assert.deepEqual(fin, { job_id: 'TH-001', price: 1450, planned_cost: 920, actual_cost: 1190 });
  const b = P.mapJobRow({ job: 'T2', date: '2026-11-05', customer: 'X', destination: 'Y', slot: '10:00', status: 'booked' }, n => n);
  assert.equal(b.job.status, 'not_started'); assert.equal(b.job.pod_status, 'n/a'); assert.equal(b.fin, null);
  assert.throws(() => P.mapJobRow({ job: 'T3', date: '2026-11-05', customer: 'X', destination: 'Y', slot: 'morning' }, n => n), /slot must be HH:MM/);
});
test('column checks name what is missing', () => {
  assert.deepEqual(P.checkColumns('funding', [{ as_at: '1', drawn: '2' }]), ['Missing column "advance_rate".', 'Missing column "facility_ceiling".']);
  assert.deepEqual(P.checkColumns('jobs', []), ['The file has no data rows.']);
});
test('Xero invoice mapping: receivables only, outstanding vs paid', () => {
  const f = (id, n) => 'C-' + n;
  assert.equal(P.mapXeroInvoice({ Type: 'ACCPAY', Status: 'AUTHORISED' }, f), null);
  assert.equal(P.mapXeroInvoice({ Type: 'ACCREC', Status: 'DRAFT' }, f), null);
  const o = P.mapXeroInvoice({ Type: 'ACCREC', Status: 'AUTHORISED', InvoiceNumber: 'INV-1', Contact: { ContactID: 'abc', Name: 'Acme' }, DateString: '2026-10-01T00:00:00', DueDateString: '2026-10-31T00:00:00', AmountDue: 500, Total: 600 }, f);
  assert.deepEqual([o.id, o.customer_id, o.amount, o.status, o.due_date], ['INV-1', 'C-Acme', 500, 'outstanding', '2026-10-31']);
  assert.equal(P.mapXeroInvoice({ Type: 'ACCREC', Status: 'PAID', InvoiceNumber: 'INV-2', Contact: {}, Date: '/Date(1790000000000+0000)/', Total: 900, AmountDue: 0 }, f).amount, 900);
});
test('delivery email escapes content', () => {
  const m = P.deliveryEmail({ contactName: '<b>x</b>', jobId: 'J1', ref: 'R1', dest: 'Leeds', deliveredAt: '09:30', link: 'https://x/?a=1&b=2', hours: 24, company: 'Trans Haul' });
  assert.ok(!m.html.includes('<b>x</b>') && m.html.includes('&lt;b&gt;x&lt;/b&gt;') && m.html.includes('a=1&amp;b=2'));
  assert.equal(m.subject, 'Delivered: R1 to Leeds');
});
