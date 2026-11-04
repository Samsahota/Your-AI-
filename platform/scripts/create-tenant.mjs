// Creates a real haulier company and invites its first director (who then invites the rest of the team).
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... APP_URL=https://portal.example.co.uk \
//   node scripts/create-tenant.mjs --name "Trans Haul" --slug trans-haul --director "Paul Dyer" --email paul@... [--legal "THEL (Midlands) Ltd"]
// The service-role key is only ever used on a trusted machine or in CI — never in the browser.
import { createClient } from '@supabase/supabase-js';
const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
const need = (v, m) => { if (!v) { console.error(m); process.exit(1); } return v; };
const url = need(process.env.SUPABASE_URL, 'Set SUPABASE_URL'), key = need(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Set SUPABASE_SERVICE_ROLE_KEY'), app = need(process.env.APP_URL, 'Set APP_URL');
const name = need(arg('name'), '--name required'), slug = need(arg('slug'), '--slug required'), director = need(arg('director'), '--director required'), email = need(arg('email'), '--email required');
const db = createClient(url, key, { auth: { persistSession: false } });
const fail = (m, e) => { console.error(m, e?.message || e || ''); process.exit(1); };

const { data: t, error: te } = await db.from('tenants').insert({ slug, name, legal_name: arg('legal') || null }).select().single();
if (te) fail('Could not create company:', te);
const conns = [
  ['vigo', 'Vigo', 'Transport management — jobs, allocations, PODs', 'Awaiting access', 'Read-only API (configure once documentation is supplied) or file import', 'Jobs, customers, allocations, POD status'],
  ['xero', 'Xero', 'Accounting — invoices, aged debtors, payments', 'Proposed', 'OAuth 2.0, read-only, authorised by the director', 'Invoices, aged receivables, payments'],
  ['bibby', 'Bibby', 'Invoice finance — availability and drawn balance', 'Proposed', 'Statement file import', 'Eligible receivables, advance rate, drawn balance'],
  ['tacho', 'Tachomaster', "Drivers' hours, infringements, training records", 'Proposed', 'Export file import', 'Infringements, licence and CPC records'],
  ['paragon', 'Paragon', 'Route optimisation — planned miles and times', 'Proposed', 'Route plan file import', 'Planned routes, miles and drive times'],
  ['sharepoint', 'SharePoint', 'Policies and SOPs', 'Proposed', 'Microsoft Graph, read-only, site-scoped', 'Document titles, metadata and previews'],
  ['fuel', 'Fuel cards', 'Fuel transactions by vehicle', 'Supplier to confirm', 'To be confirmed with supplier', 'Litres, cost, location, vehicle'],
  ['telematics', 'Telematics', 'Vehicle location, mileage, waiting evidence', 'Supplier to confirm', 'To be confirmed with supplier', 'GPS events, mileage, dwell time'],
].map(([id, n, purpose, state, method, data]) => ({ tenant_id: t.id, id, name: n, purpose, state, method, owner: name, data }));
let r = await db.from('connections').insert(conns); if (r.error) fail('Connections:', r.error);
r = await db.from('rate_cards').insert({ tenant_id: t.id, version: 'RC-INITIAL', note: 'Initial rate card — review before use',
  rates: { artic: 1.65, artFuel: 0.62, rigid26: 1.30, rigid18: 1.05, employed: 19, ltd: 23, agency: 28, otMult: 1.5, pallet: 5.5, overheadStd: 61.5 } });
if (r.error) fail('Rate card:', r.error);
const { data: inv, error: ie } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${app}/?next=accept`, data: { name: director } });
if (ie) fail('Invitation failed:', ie);
r = await db.from('profiles').insert({ user_id: inv.user.id, tenant_id: t.id, name: director, email, role: 'director', title: 'Managing Director', status: 'invited' });
if (r.error) fail('Profile:', r.error);
console.log(`Created ${name} (${t.id}). Invitation emailed to ${email}.`);
