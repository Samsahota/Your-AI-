// POST { kind: 'jobs'|'invoices'|'funding'|'compliance'|'routes', csv: string, dry_run?: boolean }
// File imports let a haulier go live on exports from Vigo, Xero, Bibby, Tachomaster and Paragon
// before (or instead of) API access. Every import is recorded in integration_runs.
import { handler, caller, admin, json, HttpError, activity, startRun, finishRun } from '../_shared/runtime.ts';
import { parseCSV, checkColumns, mapJobRow, money, ukDate, IMPORT_SPECS, type ImportKind } from '../_shared/pure.ts';
import { ensureCustomers, upsertJobs } from '../_shared/upsert.ts';

const WHO: Record<ImportKind, string[]> = { jobs: ['director', 'operations'], invoices: ['director'], funding: ['director'], compliance: ['director', 'transport'], routes: ['director', 'operations'] };

Deno.serve(handler(async (req) => {
  const b = await req.json();
  const kind = b.kind as ImportKind;
  if (!IMPORT_SPECS[kind]) throw new HttpError(400, 'Unknown import type.');
  const me = await caller(req, WHO[kind]);
  if (typeof b.csv !== 'string' || b.csv.length > 5_000_000) throw new HttpError(400, 'Attach a CSV file under 5 MB.');
  const rows = parseCSV(b.csv);
  const colErr = checkColumns(kind, rows);
  if (colErr.length) throw new HttpError(400, colErr.join(' ') + ' Expected: ' + IMPORT_SPECS[kind].describe);
  const db = admin(); const t = me.tenantId;
  const errors: string[] = [];
  const safe = <T,>(i: number, fn: () => T): T | null => { try { return fn(); } catch (e) { errors.push(`Row ${i + 2}: ${e instanceof Error ? e.message : e}`); return null; } };
  let mapped: any[] = [];
  if (kind === 'jobs') {
    const custFor = await ensureCustomers(db, t, b.dry_run ? [] : rows.map(r => r.customer));
    mapped = rows.map((r, i) => safe(i, () => mapJobRow(r, custFor))).filter(Boolean);
  } else if (kind === 'invoices') {
    const custFor = await ensureCustomers(db, t, b.dry_run ? [] : rows.map(r => r.customer));
    mapped = rows.map((r, i) => safe(i, () => ({ tenant_id: t, id: r.invoice, customer_id: custFor(r.customer), date: ukDate(r.date), due_date: ukDate(r.due_date), amount: money(r.amount),
      status: /paid/i.test(r.status || '') ? 'paid' : 'outstanding', eligible: !/query|dispute/i.test(r.status || ''), ineligible_reason: /query|dispute/i.test(r.status || '') ? r.status : null, source: 'import' }))).filter(Boolean);
  } else if (kind === 'funding') {
    mapped = rows.map((r, i) => safe(i, () => { const a = Number(r.advance_rate); return { tenant_id: t, as_at: ukDate(r.as_at), provider: r.provider || 'Bibby', advance_rate: a > 1 ? a / 100 : a, facility_ceiling: money(r.facility_ceiling), drawn: money(r.drawn), rule: r.rule || null }; })).filter(Boolean);
  } else if (kind === 'compliance') {
    mapped = rows.map((r, i) => safe(i, () => ({ tenant_id: t, id: r.id || `${r.kind}-${r.driver}-${ukDate(r.due)}`.toUpperCase(), kind: r.kind, driver_id: r.driver, title: r.title, detail: r.detail || null,
      due: ukDate(r.due), status: ['overdue', 'unsigned', 'upcoming'].includes(r.status) ? r.status : (ukDate(r.due)! < new Date().toISOString().slice(0, 10) ? 'overdue' : 'upcoming'), source: 'Tachomaster import' }))).filter(Boolean);
  } else if (kind === 'routes') {
    mapped = rows.map((r, i) => safe(i, () => ({ id: r.job, miles: Number(r.planned_miles), minutes: r.planned_minutes ? Number(r.planned_minutes) : null }))).filter(Boolean);
  }
  if (b.dry_run) return json({ dry_run: true, rows: rows.length, valid: mapped.length, errors, sample: mapped.slice(0, 3) });
  const run = await startRun(db, t, `import:${kind}`);
  try {
    let n = 0;
    if (kind === 'jobs') n = await upsertJobs(db, t, mapped);
    if (kind === 'invoices') { const { error } = await db.from('invoices').upsert(mapped, { onConflict: 'tenant_id,id' }); if (error) throw error; n = mapped.length; }
    if (kind === 'funding') { const { error } = await db.from('funding_positions').upsert(mapped, { onConflict: 'tenant_id,as_at' }); if (error) throw error; n = mapped.length; }
    if (kind === 'compliance') { const { error } = await db.from('compliance_items').upsert(mapped, { onConflict: 'tenant_id,id', ignoreDuplicates: true }); if (error) throw error; n = mapped.length; }
    if (kind === 'routes') { for (const r of mapped) { await db.from('jobs').update({ miles: r.miles }).eq('tenant_id', t).eq('id', r.id); n++; } }
    await finishRun(db, run, 'ok', { rows_in: rows.length, rows_upserted: n, detail: { errors } });
    await activity(db, t, { id: me.userId, name: me.name, role: me.role }, `Imported ${kind} file`, 'import', kind, null, `${n} rows imported${errors.length ? `, ${errors.length} rejected` : ''}`);
    return json({ ok: true, rows: rows.length, imported: n, errors });
  } catch (e) { await finishRun(db, run, 'error', { rows_in: rows.length, error: String(e instanceof Error ? e.message : e) }); throw e; }
}));
