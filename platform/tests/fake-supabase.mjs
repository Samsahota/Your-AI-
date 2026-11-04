// TEST DOUBLE for Supabase's HTTP APIs — local end-to-end testing only, never deployed.
// Implements the small subset the live app uses (REST reads, RPC, password sign-in, storage) on top of
// the real local Postgres. Every data request runs as `authenticated` with the caller's JWT claims,
// so the real row-level security and workflow functions decide every result.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import pg from 'pg';

// Match PostgREST's JSON: dates as 'YYYY-MM-DD', numerics as numbers.
pg.types.setTypeParser(1082, v => v);
pg.types.setTypeParser(1700, v => v === null ? null : parseFloat(v));

export function startFakeSupabase({ port = 54400, pgUrl, staticDir, config }) {
  const pool = new pg.Pool({ connectionString: pgUrl, max: 8 });
  const files = new Map();
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = sub => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })}.sig`;
  const claims = req => { const t = (req.headers.authorization || '').replace(/^Bearer /, ''); try { const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); return p.sub ? p : null; } catch { return null; } };
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
  const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': 'Content-Range', ...headers }); res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)); };
  const readBody = req => new Promise(r => { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => r(Buffer.concat(ch))); });

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      if (req.method === 'OPTIONS') return send(res, 204);
      // ---- auth
      if (u.pathname === '/auth/v1/token') {
        const b = JSON.parse((await readBody(req)).toString() || '{}');
        const { rows } = await pool.query('select id, email from auth.users where lower(email) = lower($1)', [b.email || '']);
        if (!rows.length || !b.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
        const user = { id: rows[0].id, email: rows[0].email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
        return send(res, 200, { access_token: jwt(user.id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + user.id, user });
      }
      if (u.pathname === '/auth/v1/logout') return send(res, 204);
      if (u.pathname === '/auth/v1/user') { const c = claims(req); return c ? send(res, 200, { id: c.sub, aud: 'authenticated' }) : send(res, 401, { msg: 'no session' }); }
      // ---- rest
      if (u.pathname.startsWith('/rest/v1/rpc/')) {
        const fn = u.pathname.split('/').pop(); const args = JSON.parse((await readBody(req)).toString() || '{}');
        const names = Object.keys(args);
        const sql = `select public.${ident(fn)}(${names.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')}) as r`;
        const vals = names.map(k => args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]);
        const r = await asUser(claims(req), cl => cl.query(sql, vals));
        return send(res, 200, JSON.stringify(r.rows[0].r));
      }
      if (u.pathname.startsWith('/rest/v1/')) {
        const table = u.pathname.split('/').pop(); const where = []; const vals = []; let order = ''; let limit = ''; let offset = '';
        for (const [k, v] of u.searchParams) {
          if (k === 'select') continue;
          if (k === 'order') { order = ' order by ' + v.split(',').map(x => { const [c, d] = x.split('.'); return ident(c) + (d === 'desc' ? ' desc' : ' asc'); }).join(', '); continue; }
          if (k === 'limit') { limit = ' limit ' + Number(v); continue; }
          if (k === 'offset') { offset = ' offset ' + Number(v); continue; }
          const [op, ...rest] = v.split('.'); const val = rest.join('.');
          const map = { eq: '=', gte: '>=', lte: '<=', gt: '>', lt: '<', neq: '<>' };
          if (map[op]) { vals.push(val); where.push(`${ident(k)} ${map[op]} $${vals.length}`); }
          else if (op === 'in') { vals.push(val.replace(/^\(|\)$/g, '').split(',')); where.push(`${ident(k)} = any($${vals.length})`); }
          else if (op === 'ilike') { vals.push(val.replace(/\*/g, '%')); where.push(`${ident(k)} ilike $${vals.length}`); }
          else throw new Error('unsupported filter ' + v);
        }
        const range = req.headers.range && req.headers.range.match(/(\d+)-(\d+)/);
        if (range) { offset = ' offset ' + Number(range[1]); limit = ' limit ' + (Number(range[2]) - Number(range[1]) + 1); }
        const sql = `select * from public.${ident(table)}${where.length ? ' where ' + where.join(' and ') : ''}${order}${limit}${offset}`;
        const r = await asUser(claims(req), cl => cl.query(sql, vals));
        const single = /vnd\.pgrst\.object/.test(req.headers.accept || '');
        if (single) return r.rows.length === 1 ? send(res, 200, r.rows[0]) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `Results contain ${r.rows.length} rows` });
        const from = range ? Number(range[1]) : 0;
        return send(res, 200, r.rows, { 'Content-Range': `${from}-${from + r.rows.length - 1}/*` });
      }
      // ---- storage
      const up = u.pathname.match(/^\/storage\/v1\/object\/pods\/(.+)$/);
      if (up && req.method === 'POST') {
        const name = decodeURIComponent(up[1]); const body = await readBody(req);
        await asUser(claims(req), cl => cl.query(`insert into storage.objects (bucket_id, name, owner) values ('pods', $1, auth.uid())`, [name]));
        let file = body, type = req.headers['content-type'] || 'image/jpeg';
        const bm = type.match(/boundary=(.+)$/);
        if (bm) {   // multipart upload (what supabase-js sends for a Blob): take the part that carries a filename or content-type
          const parts = body.toString('latin1').split('--' + bm[1]);
          const part = parts.find(x => /filename=|Content-Type: image/i.test(x) && x.includes('\r\n\r\n'));
          const i = part.indexOf('\r\n\r\n'); const head = part.slice(0, i);
          type = (head.match(/Content-Type: ([^\r\n]+)/i) || [, 'image/jpeg'])[1];
          file = Buffer.from(part.slice(i + 4).replace(/\r\n$/, ''), 'latin1');
        }
        files.set(name, { body: file, type });
        return send(res, 200, { Key: 'pods/' + name, Id: name });
      }
      if (u.pathname === '/storage/v1/object/sign/pods' && req.method === 'POST') {
        const b = JSON.parse((await readBody(req)).toString());
        const out = await asUser(claims(req), async cl => {
          const r = await cl.query(`select name from storage.objects where bucket_id = 'pods' and name = any($1)`, [b.paths]);
          const ok = new Set(r.rows.map(x => x.name));
          return b.paths.map(p => ok.has(p) ? { path: p, signedURL: `/object/sign/pods/${p}?token=test`, error: null } : { path: p, signedURL: null, error: 'Object not found' });
        });
        return send(res, 200, out);
      }
      const dl = u.pathname.match(/^\/storage\/v1\/object\/sign\/pods\/(.+)$/);
      if (dl) { const f = files.get(decodeURIComponent(dl[1])); if (!f) return send(res, 404, { error: 'not found' }); res.writeHead(200, { 'Content-Type': f.type }); return res.end(f.body); }
      if (u.pathname.startsWith('/functions/v1/')) return send(res, 501, { error: 'Edge functions are not available in the local test double.' });
      if (u.pathname.startsWith('/realtime/')) return send(res, 404, {});
      // ---- static app
      let f = u.pathname === '/' ? 'index.html' : u.pathname.slice(1);
      const p = path.join(staticDir, f);
      if (!p.startsWith(staticDir) || !fs.existsSync(p)) return send(res, 404, 'not found');
      let body = fs.readFileSync(p);
      if (f === 'index.html') body = Buffer.from(body.toString().replace(/window\.THP_CONFIG = .*?;<\/script>/, `window.THP_CONFIG = ${JSON.stringify(config)};</script>`));
      res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(body);
    } catch (e) { send(res, 400, { message: e.message, code: e.code || 'P0001', details: null, hint: null }); }
  });
  return new Promise(r => server.listen(port, () => r({ close: () => { server.close(); pool.end(); } })));
}
