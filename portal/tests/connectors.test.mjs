// Connection engine tests. Run: npm run test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toObjects, convert, mapRows, runChecks, processCsv, checkHeaders, sha256 } from '../connectors/core.mjs';
import { CATALOGUE, TEMPLATES } from '../connectors/catalogue.mjs';

const JOBS_MAPPING = {
  target: 'jobs', key: 'job_ref', skipWhen: { column: 'Job No', equals: 'TOTAL' },
  fields: {
    job_ref: { from: 'Job No', type: 'text', required: true },
    job_date: { from: 'Date', type: 'date', format: 'DD/MM/YYYY', required: true },
    due_at: { from: ['Date', 'Due'], type: 'datetime', format: 'DD/MM/YYYY' },
    in_full: { from: 'Short', type: 'bool', invert: true },
    revenue: { from: 'Price', type: 'money' },
  },
};
const CSV = '﻿Job No,Date,Due,Short,Price\r\nJ-1,17/11/2026,12:00,No,"£1,000.00"\r\nJ-2,17/11/2026,09:30,Yes,950.50\r\n"J-3, urgent",17/07/2026,08:00,no,(50.00)\r\nTOTAL,,,,"1,900.50"\r\n';

test('CSV: quotes, commas inside quotes, BOM and Windows line endings', () => {
  const rows = parseCsv(CSV);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0], ['Job No', 'Date', 'Due', 'Short', 'Price']);
  assert.equal(rows[3][0], 'J-3, urgent');
  assert.deepEqual(parseCsv('a,"say ""hi"""\n1,"two\nlines"'), [['a', 'say "hi"'], ['1', 'two\nlines']]);
});

test('Types: money, numbers, yes/no, UK dates and UK times (GMT and BST)', () => {
  assert.equal(convert('£1,234.50', { type: 'money' }), 1234.5);
  assert.equal(convert('(12.30)', { type: 'money' }), -12.3);
  assert.equal(convert('Yes', { type: 'bool' }), true);
  assert.equal(convert('Y', { type: 'bool', invert: true }), false);
  assert.equal(convert('03/02/26', { type: 'date' }), '2026-02-03');
  assert.equal(convert('2026-11-17', { type: 'date' }), '2026-11-17');
  assert.equal(convert(['17/11/2026', '12:00'], { type: 'datetime' }), '2026-11-17T12:00:00.000Z');   // winter: GMT
  assert.equal(convert(['17/07/2026', '12:00'], { type: 'datetime' }), '2026-07-17T11:00:00.000Z');   // summer: BST
  assert.throws(() => convert('31/02/2026', { type: 'date' }), /not a real date/);
  assert.throws(() => convert('abc', { type: 'money' }), /not a number/);
  assert.throws(() => convert('', { type: 'text', required: true }), /is empty/);
  assert.equal(convert('', { type: 'money' }), null);
});

test('Mapping: rows become standard records; problems name the Excel row and column', () => {
  const { items } = toObjects(parseCsv(CSV));
  const { records, errors } = mapRows(items, JOBS_MAPPING);
  assert.equal(errors.length, 0);
  assert.equal(records.length, 3);   // TOTAL row skipped
  assert.deepEqual(records[0], { job_ref: 'J-1', job_date: '2026-11-17', due_at: '2026-11-17T12:00:00.000Z', in_full: true, revenue: 1000 });
  assert.equal(records[1].in_full, false);
  const bad = mapRows([{ 'Job No': 'J-9', Date: '32/11/2026', Due: '10:00', Short: 'maybe', Price: '1' }], JOBS_MAPPING);
  assert.equal(bad.records.length, 0);
  assert.deepEqual(bad.errors.map(e => [e.row, e.column]), [[2, 'Date'], [2, 'Date + Due'], [2, 'Short']]);
});

test('Checks: duplicates, row counts and totals must match the source exactly', () => {
  const records = [{ job_ref: 'A', revenue: 10 }, { job_ref: 'A', revenue: 5.005 }];
  const r = runChecks({ records, errors: [], key: 'job_ref', control: { rowCount: 3, totals: { revenue: 15.01 } } });
  assert.equal(r.passed, false);
  assert.deepEqual(r.checks.map(c => [c.name, c.passed]),
    [['rows readable', true], ['no duplicates', false], ['row count matches source', false], ['total revenue matches source', true]]);
  assert.equal(runChecks({ records: [{ job_ref: 'A', revenue: 1 }], errors: [], key: 'job_ref', control: { totals: { revenue: 1.01 } } }).passed, false);
});

test('Pipeline: a good file passes; a renamed column or a wrong total writes nothing', () => {
  const good = processCsv(CSV, JOBS_MAPPING, { rowCount: 3, totals: { revenue: 1900.5 } });
  assert.equal(good.status, 'ok');
  assert.equal(good.records.length, 3);

  const renamed = processCsv(CSV.replace('Price', 'Amount'), JOBS_MAPPING);
  assert.equal(renamed.status, 'check_failed');
  assert.equal(renamed.records.length, 0);
  assert.match(renamed.error, /Column missing: Price\. Has the report layout changed\?/);

  const wrongTotal = processCsv(CSV, JOBS_MAPPING, { totals: { revenue: 1900 } });
  assert.equal(wrongTotal.status, 'check_failed');
  assert.equal(wrongTotal.records.length, 0);
  assert.match(wrongTotal.error, /Source total for revenue is 1900, our total is 1900.5/);
});

test('Catalogue: all eight Trans Haul systems listed; unverified ones are flagged; no secrets in templates', () => {
  for (const s of ['vigo', 'tachomaster', 'falcon', 'predrive', 'xero', 'sharepoint', 'brightpay', 'bibby']) assert.ok(CATALOGUE[s], s);
  assert.deepEqual(Object.entries(CATALOGUE).filter(([, v]) => v.verified).map(([k]) => k).sort(), ['sharepoint', 'xero']);
  assert.ok(!/password|secret|api_?key|token/i.test(JSON.stringify({ CATALOGUE, TEMPLATES })));
  assert.equal(checkHeaders(['Reference', 'Type', 'Date', 'Time', 'Area', 'What happened', 'Status', 'Open actions'], TEMPLATES.incidents).passed, true);
});

test('Each run stores a fingerprint of the exact input', async () => {
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
