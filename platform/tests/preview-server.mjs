// Local preview of the production build for hands-on testing (not for real use: any password is accepted).
// Run: node tests/preview-server.mjs   → http://localhost:8080
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { startFakeSupabase } from './fake-supabase.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)); const port = Number(process.env.PORT || 8080);
await startFakeSupabase({ port, pgUrl: process.env.PGURL || 'postgres://postgres@localhost:54329/thp?host=/tmp', staticDir: path.join(here, '../web/dist'),
  config: { mode: 'live', supabaseUrl: `http://localhost:${port}`, supabaseAnonKey: 'preview', historyDays: 60, companyFooter: 'Local test preview' } });
console.log(`Preview running on http://localhost:${port}`);
