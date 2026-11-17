// PREVIEW ONLY. Stands in for Supabase so the real Clearpath screens run in a browser with no server.
// Every answer is a recording of what the real database returned to that role for Trans Haul as it stands
// before its systems are connected (no figures yet),
// made by scripts/record-preview.mjs. Changes are refused politely: nothing is saved anywhere.
(function () {
  const BASE = 'https://preview.clearpath.invalid';
  const ROLES = {
    director: { sub: '10000000-0000-4000-8000-000000000002', email: 'director@transhaul.test', label: 'Director' },
    consultant: { sub: '10000000-0000-4000-8000-000000000003', email: 'consultant@transhaul.test', label: 'Consultant (Clearpath)' },
    operations: { sub: '10000000-0000-4000-8000-000000000004', email: 'ops@transhaul.test', label: 'Operations manager' },
    transport: { sub: '10000000-0000-4000-8000-000000000005', email: 'transport@transhaul.test', label: 'Transport manager' },
    warehouse: { sub: '10000000-0000-4000-8000-000000000006', email: 'warehouse@transhaul.test', label: 'Warehouse manager' },
    admin: { sub: '10000000-0000-4000-8000-000000000001', email: 'admin@yourai.test', label: 'Platform admin (Your AI)' },
  };
  const COMPANY_A = '20000000-0000-4000-8000-00000000000a';
  const SAVED_MSG = 'This is a preview, so changes aren\'t saved. In the live portal this would be saved and logged.';
  const WRITES = ['add_comment', 'acknowledge_document', 'log_incident', 'update_incident', 'set_user_status', 'set_access_override',
    'set_threshold', 'save_connection', 'create_document', 'publish_document_version', 'set_subscription', 'create_company',
    'set_company_status', 'compute_measures', 'import_records', 'record_run'];
  const REC = window.__CLEARPATH_REC || {};

  // Some embedded browsers block storage: fall back to memory so the app still runs.
  try { sessionStorage.setItem('__t', '1'); sessionStorage.removeItem('__t'); }
  catch (e) {
    const m = {};
    const mem = { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, clear: () => { for (const k in m) delete m[k]; } };
    try { Object.defineProperty(window, 'sessionStorage', { value: mem, configurable: true }); } catch (_) { /* nothing more to do */ }
  }

  const b64 = s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const token = (sub, aal) => `${b64('{"alg":"none"}')}.${b64(JSON.stringify({ sub, role: 'authenticated', aal, exp: 4102444800 }))}.preview`;
  const sessionFor = (r, aal) => ({ access_token: token(ROLES[r].sub, aal), token_type: 'bearer', expires_in: 3600, refresh_token: `r.${aal}.${r}`,
    user: { id: ROLES[r].sub, email: ROLES[r].email }, preview_role: r });
  const roleFromAuth = h => {
    try { const sub = JSON.parse(atob(h.replace(/^Bearer /, '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; return Object.keys(ROLES).find(k => ROLES[k].sub === sub) || null; }
    catch (e) { return null; }
  };

  // Which role to open as: remembered in window.name, which survives a reload.
  const m = /^clearpath-preview:(\w+)$/.exec(window.name || '');
  const role = m && ROLES[m[1]] ? m[1] : 'director';
  function seed(r) {
    window.name = 'clearpath-preview:' + r;
    sessionStorage.setItem('portal.session', JSON.stringify(sessionFor(r, 'aal2')));
    if (r === 'admin') sessionStorage.setItem('portal.company', COMPANY_A); else sessionStorage.removeItem('portal.company');
  }
  try {
    const cur = JSON.parse(sessionStorage.getItem('portal.session') || 'null');
    if (!cur || cur.preview_role !== role) seed(role);
  } catch (e) { seed(role); }

  window.PORTAL_CONFIG = { url: BASE, anonKey: 'preview' };

  const reply = (status, body) => new Response(status === 204 ? null : (typeof body === 'string' ? body : JSON.stringify(body)),
    { status, headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    init = init || {};
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== BASE) return realFetch(input, init);
    await new Promise(r => setTimeout(r, 90));
    const method = (init.method || 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? init.body : '';
    const p = url.pathname;
    const headers = init.headers || {};
    const who = roleFromAuth(headers.Authorization || headers.authorization || '');
    const json = () => { try { return JSON.parse(body || '{}'); } catch (e) { return {}; } };

    // ---------------------------------------------------------------- sign-in (any password; any six-digit code)
    if (p === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const email = String(json().email || '').toLowerCase();
      const r = Object.keys(ROLES).find(k => ROLES[k].email === email);
      if (!r) return reply(400, { error_description: 'Invalid login credentials' });
      window.name = 'clearpath-preview:' + r;
      if (r === 'admin') sessionStorage.removeItem('portal.company');
      return reply(200, sessionFor(r, 'aal1'));
    }
    if (p === '/auth/v1/token') {
      const [, aal, r] = String(json().refresh_token || '').split('.');
      return ROLES[r] ? reply(200, sessionFor(r, aal)) : reply(400, { error_description: 'Invalid refresh token' });
    }
    if (p === '/auth/v1/user') {
      if (!who) return reply(401, { msg: 'Sign in again' });
      if (method === 'PUT') return reply(400, { msg: SAVED_MSG });
      return reply(200, { id: ROLES[who].sub, email: ROLES[who].email, factors: [{ id: 'preview-factor', factor_type: 'totp', status: 'verified' }] });
    }
    if (p === '/auth/v1/logout') return reply(204);
    if (p === '/auth/v1/recover') return reply(200, {});
    if (p === '/auth/v1/factors/preview-factor/challenge') return reply(200, { id: 'preview-challenge' });
    if (p === '/auth/v1/factors/preview-factor/verify') {
      if (!/^\d{6}$/.test(String(json().code || ''))) return reply(422, { msg: 'Invalid TOTP code entered' });
      return who ? reply(200, sessionFor(who, 'aal2')) : reply(401, { msg: 'Sign in again' });
    }
    if (p.startsWith('/auth/')) return reply(400, { msg: SAVED_MSG });

    // ---------------------------------------------------------------- data and functions
    if (p.startsWith('/functions/')) return reply(400, { error: SAVED_MSG });
    const fn = p.startsWith('/rest/v1/rpc/') ? p.split('/').pop() : null;
    if (fn === 'set_demo_view' || fn === 'accept_invitation') return reply(200, 'null');
    if (fn && WRITES.includes(fn)) return reply(400, { message: SAVED_MSG });
    const rec = (REC[who] || {})[`${method} ${p}${url.search} ${body}`];
    if (rec) return reply(rec.status, rec.body);
    if (method === 'GET') return reply(200, '[]');
    return reply(400, { message: 'This view isn\'t included in the preview.' });
  };

  // ---------------------------------------------------------------- the preview bar
  function bar() {
    const el = document.createElement('div');
    el.className = 'pv-bar';
    el.innerHTML = `<span class="pv-tag">Preview</span><span class="pv-text">Trans Haul's portal as it stands today: figures appear as each system is connected. Changes aren't saved in this preview.</span>
      <label class="pv-pick"><span>View as</span><select id="pv-role">${Object.keys(ROLES).map(k => `<option value="${k}" ${k === role ? 'selected' : ''}>${ROLES[k].label}</option>`).join('')}</select></label>`;
    document.body.prepend(el);
    el.querySelector('#pv-role').onchange = e => { seed(e.target.value); location.hash = ''; location.reload(); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bar); else bar();
})();
