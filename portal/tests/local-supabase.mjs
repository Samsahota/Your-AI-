// LOCAL TEST STAND-IN for Supabase's HTTP interface. Never deployed.
// Implements the parts the portal uses (password sign-in, two-factor with real authenticator codes,
// table reads, functions, the invite function) on top of the real local Postgres. Every data
// request runs as role "authenticated" with the caller's token claims, so the real row-level
// security and database functions decide every result, exactly as on Supabase.
// Test-only shortcuts: tokens are unsigned, and every existing user's password is TEST_PASSWORD.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import pg from 'pg';

export const TEST_PASSWORD = 'Test-password-1';
pg.types.setTypeParser(1082, v => v);                                     // dates as 'YYYY-MM-DD'
pg.types.setTypeParser(1700, v => v === null ? null : parseFloat(v));     // numerics as numbers

// ---------------------------------------------------------------- TOTP (RFC 6238), as authenticator apps use
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Decode(s) {
  let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
}
export function totp(secret, t = Date.now()) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
const newSecret = () => Array.from(crypto.randomBytes(20), b => B32[b % 32]).join('');

export function startLocalSupabase({ port = 54410, pgUrl, rootDir, config }) {
  const pool = new pg.Pool({ connectionString: pgUrl, max: 8 });
  const factors = new Map();      // userId -> [{ id, secret, status }]
  const challenges = new Map();   // challengeId -> factorId
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = (sub, aal) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aal, amr: [{ method: aal === 'aal2' ? 'totp' : 'password' }], exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })}.sig`;
  const claims = req => { const t = (req.headers.authorization || '').replace(/^Bearer /, ''); try { const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); return p.sub ? p : null; } catch { return null; } };
  const userJson = async id => {
    const { rows } = await pool.query('select id, email from auth.users where id = $1', [id]);
    return { id, email: rows[0]?.email, aud: 'authenticated', role: 'authenticated',
      factors: (factors.get(id) || []).map(f => ({ id: f.id, factor_type: 'totp', status: f.status, friendly_name: 'Authenticator app' })) };
  };
  const session = async (sub, aal) => ({ access_token: token(sub, aal), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `r.${aal}.${sub}`, user: await userJson(sub) });
  async function asUser(c, fn) {
    const cl = await pool.connect();
    try {
      await cl.query('begin');
      await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(c || { role: 'anon' })]);
      await cl.query(c ? 'set local role authenticated' : 'set local role anon');
      const r = await fn(cl); await cl.query('commit'); return r;
    } catch (e) { await cl.query('rollback').catch(() => {}); throw e; } finally { cl.release(); }
  }
  const ident = s => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error('bad identifier ' + s); return '"' + s + '"'; };
  const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', ...headers }); res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)); };
  const readBody = req => new Promise(r => { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => r(Buffer.concat(ch).toString())); });
  const json = async req => JSON.parse((await readBody(req)) || '{}');

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      if (req.method === 'OPTIONS') return send(res, 204);
      // ---------------------------------------------------------------- auth
      if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
        const b = await json(req);
        const { rows } = await pool.query('select id from auth.users where lower(email) = lower($1)', [b.email || '']);
        if (!rows.length || b.password !== TEST_PASSWORD) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        return send(res, 200, await session(rows[0].id, 'aal1'));
      }
      if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'refresh_token') {
        const [, aal, sub] = ((await json(req)).refresh_token || '').split('.');
        if (!sub) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid refresh token' });
        return send(res, 200, await session(sub, aal));
      }
      if (u.pathname === '/auth/v1/user') {
        const c = claims(req); if (!c) return send(res, 401, { msg: 'Sign in again' });
        if (req.method === 'PUT') { const b = await json(req); if (!b.password || b.password.length < 12) return send(res, 422, { msg: 'Password should be at least 12 characters.' }); }
        return send(res, 200, await userJson(c.sub));
      }
      if (u.pathname === '/auth/v1/recover') return send(res, 200, {});
      if (u.pathname === '/auth/v1/logout') return send(res, 204);
      if (u.pathname === '/auth/v1/factors' && req.method === 'POST') {
        const c = claims(req); if (!c) return send(res, 401, { msg: 'Sign in again' });
        const f = { id: crypto.randomUUID(), secret: newSecret(), status: 'unverified' };
        factors.set(c.sub, [...(factors.get(c.sub) || []).filter(x => x.status === 'verified'), f]);
        const email = (await userJson(c.sub)).email;
        const uri = `otpauth://totp/Operations%20Platform:${encodeURIComponent(email)}?secret=${f.secret}&issuer=Operations%20Platform`;
        const qr = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#eee"/><text x="80" y="76" font-size="12" text-anchor="middle">Local test:</text><text x="80" y="94" font-size="12" text-anchor="middle">enter the key</text></svg>')}`;
        return send(res, 200, { id: f.id, type: 'totp', totp: { qr_code: qr, secret: f.secret, uri } });
      }
      const fc = u.pathname.match(/^\/auth\/v1\/factors\/([^/]+)\/(challenge|verify)$/);
      if (fc && req.method === 'POST') {
        const c = claims(req); if (!c) return send(res, 401, { msg: 'Sign in again' });
        const f = (factors.get(c.sub) || []).find(x => x.id === fc[1]);
        if (!f) return send(res, 404, { msg: 'Factor not found' });
        if (fc[2] === 'challenge') { const id = crypto.randomUUID(); challenges.set(id, f.id); return send(res, 200, { id, type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 }); }
        const b = await json(req);
        if (challenges.get(b.challenge_id) !== f.id) return send(res, 400, { msg: 'Challenge expired, try again' });
        const ok = [-30000, 0, 30000].some(dt => totp(f.secret, Date.now() + dt) === String(b.code));
        if (!ok) return send(res, 422, { msg: 'Invalid TOTP code entered' });
        challenges.delete(b.challenge_id); f.status = 'verified';
        return send(res, 200, await session(c.sub, 'aal2'));
      }
      // ---------------------------------------------------------------- functions
      if (u.pathname === '/functions/v1/invite-user' && req.method === 'POST') {
        const c = claims(req); const b = await json(req);
        if (!c || c.aal !== 'aal2') return send(res, 401, { error: 'Sign in with two-factor first' });
        const id = crypto.randomUUID();
        const cl = await pool.connect();
        try {
          await cl.query('begin');
          const ex = await cl.query('select id from auth.users where lower(email) = lower($1)', [b.email]);
          if (ex.rows.length) throw new Error('Someone with that email already has a login');
          await cl.query('insert into auth.users (id, email) values ($1, lower($2))', [id, b.email]);
          await cl.query(`select app.add_profile($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [c.sub, id, b.company_id, b.role, b.name, b.email, b.job_title || null, b.division || null, !!b.is_test]);
          await cl.query('commit');
        } catch (e) { await cl.query('rollback'); return send(res, 400, { error: e.message }); } finally { cl.release(); }
        return send(res, 200, { user_id: id, invited: b.email, note: 'Local test: no email is sent. Sign in with the test password.' });
      }
      if (u.pathname.startsWith('/functions/v1/')) return send(res, 501, { error: 'Not available in the local test stand-in' });
      // ---------------------------------------------------------------- data
      if (u.pathname.startsWith('/rest/v1/rpc/')) {
        const fn = u.pathname.split('/').pop(); const args = await json(req); const names = Object.keys(args);
        // Like PostgREST: look at the function's definition to know how to pass arguments and shape the result.
        const { rows: [def] } = await pool.query(`select p.proretset, coalesce(p.proargnames, '{}') as names,
            array(select format_type(t, null) from unnest(p.proargtypes) t) as types
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 limit 1`, [fn]);
        if (!def) return send(res, 404, { message: `Unknown function ${fn}` });
        const typeOf = k => def.types[def.names.indexOf(k)] || '';
        const vals = names.map(k => args[k] !== null && typeof args[k] === 'object' && /json/.test(typeOf(k)) ? JSON.stringify(args[k]) : args[k]);
        const call = `public.${ident(fn)}(${names.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`;
        if (def.proretset) return send(res, 200, (await asUser(claims(req), cl => cl.query(`select * from ${call}`, vals))).rows);
        const r = await asUser(claims(req), cl => cl.query(`select ${call} as r`, vals));
        return send(res, 200, JSON.stringify(r.rows[0].r));
      }
      if (u.pathname.startsWith('/rest/v1/')) {
        const table = u.pathname.split('/').pop(); const where = []; const vals = []; let order = ''; let limit = '';
        for (const [k, v] of u.searchParams) {
          if (k === 'select') continue;
          if (k === 'order') { order = ' order by ' + v.split(',').map(x => { const [c, d] = x.split('.'); return ident(c) + (d === 'desc' ? ' desc nulls last' : ' asc'); }).join(', '); continue; }
          if (k === 'limit') { limit = ' limit ' + Number(v); continue; }
          const [op, ...rest] = v.split('.'); const val = rest.join('.');
          const map = { eq: '=', gte: '>=', lte: '<=', gt: '>', lt: '<', neq: '<>' };
          if (op === 'eq' || op === 'neq') { vals.push(val); where.push(`${ident(k)}::text ${map[op]} $${vals.length}`); }
          else if (map[op]) { vals.push(val); where.push(`${ident(k)} ${map[op]} $${vals.length}`); }
          else if (op === 'in') { vals.push(val.replace(/^\(|\)$/g, '').split(',')); where.push(`${ident(k)}::text = any($${vals.length})`); }
          else if (op === 'is') where.push(`${ident(k)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
          else if (v === 'not.is.null') where.push(`${ident(k)} is not null`);
          else if (op === 'ilike') { vals.push(val.replace(/\*/g, '%')); where.push(`${ident(k)}::text ilike $${vals.length}`); }
          else throw new Error('unsupported filter ' + v);
        }
        const r = await asUser(claims(req), cl => cl.query(`select * from public.${ident(table)}${where.length ? ' where ' + where.join(' and ') : ''}${order}${limit}`, vals));
        return send(res, 200, r.rows);
      }
      // ---------------------------------------------------------------- the app (static files)
      let f = u.pathname === '/' ? 'web/app/index.html' : u.pathname.slice(1);
      const p = path.join(rootDir, f);
      if (!p.startsWith(rootDir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return send(res, 404, 'not found');
      let body = fs.readFileSync(p);
      if (f.endsWith('index.html')) body = Buffer.from(body.toString().replace('window.PORTAL_CONFIG = null;', `window.PORTAL_CONFIG = ${JSON.stringify(config)};`));
      const type = f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' }); res.end(body);
    } catch (e) { send(res, 400, { message: e.message, code: e.code || 'P0001' }); }
  });
  return new Promise(r => server.listen(port, () => r({ url: `http://localhost:${port}`, close: () => { server.close(); pool.end(); } })));
}
