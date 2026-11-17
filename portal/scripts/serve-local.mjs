// Runs the portal locally against the local test database (fictional companies), for trying it out.
//   npm run db:reset && npm run serve      then open http://localhost:54410
// Sign in with any test email (e.g. director@demo.test) and the password printed below.
// Two-factor works as it will live: scan or type the key into an authenticator app.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startLocalSupabase, TEST_PASSWORD } from '../tests/local-supabase.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 54410);
const s = await startLocalSupabase({ port, rootDir: root, pgUrl: process.env.PGURL || 'postgres://postgres@localhost:54329/portal_test?host=/tmp', config: { url: `http://localhost:${port}`, anonKey: 'local' } });
console.log(`Portal running at ${s.url}`);
console.log(`Test logins (password ${TEST_PASSWORD}): director@demo.test, consultant@demo.test, ops@demo.test, transport@demo.test, warehouse@demo.test, admin@example.test`);
