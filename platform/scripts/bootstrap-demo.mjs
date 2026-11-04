// Creates the five demo sign-ins for the demonstration company, then loads its data.
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEMO_PASSWORD='a-long-password' node scripts/bootstrap-demo.mjs
//   psql "$SUPABASE_DB_URL" -f supabase/seed/demo_tenant.sql
// Demo emails use the reserved .example domain, so nothing is ever delivered to a real inbox.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, DEMO_PASSWORD: pw } = process.env;
if (!url || !key || !pw || pw.length < 12) { console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD (12+ characters).'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });
const { users } = JSON.parse(fs.readFileSync(new URL('../supabase/seed/demo_users.json', import.meta.url)));
for (const [k, u] of Object.entries(users)) {
  const { error } = await db.auth.admin.createUser({ id: u.id, email: u.email, password: pw, email_confirm: true, user_metadata: { demo: true } });
  console.log(error ? `${k} ${u.email}: ${error.message}` : `${k} ${u.email}: created`);
}
console.log('Now load the demo data:  psql "$SUPABASE_DB_URL" -f supabase/seed/demo_tenant.sql');
