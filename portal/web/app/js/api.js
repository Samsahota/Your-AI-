// The app's only route to data: Supabase's sign-in, data and function endpoints.
// Row-level security in the database decides what comes back; the app never filters for security.
const CFG = window.PORTAL_CONFIG || {};
const KEY = 'portal.session';

let session = null;
try { session = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { session = null; }
const save = s => { session = s; try { s ? sessionStorage.setItem(KEY, JSON.stringify(s)) : sessionStorage.removeItem(KEY); } catch (e) {} };

export class ApiError extends Error {}

async function call(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  if (!CFG.url) throw new ApiError('The portal is not configured: missing the Supabase address.');
  const headers = { apikey: CFG.anonKey || 'local', 'Content-Type': 'application/json' };
  if (auth && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  let res;
  try { res = await fetch(CFG.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (e) { throw new ApiError('Could not reach the platform. Check your connection and try again.'); }
  if (res.status === 401 && retry && session?.refresh_token) { await refresh(); return call(path, { method, body, auth, retry: false }); }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(friendly(data?.msg || data?.message || data?.error_description || data?.error || `Request failed (${res.status})`));
  return data;
}

// Database errors are written to be read by people; tidy the few that come from the auth service.
function friendly(m) {
  if (/Invalid login credentials/i.test(m)) return 'That email and password don\'t match. Check them and try again.';
  if (/Invalid TOTP code/i.test(m)) return 'That code didn\'t work. Codes change every 30 seconds; enter the current one from your authenticator app.';
  return m;
}

const claims = () => { try { return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return {}; } };

async function refresh() {
  try { save(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false, retry: false })); }
  catch (e) { save(null); throw new ApiError('Your session has ended. Please sign in again.'); }
}

export const auth = {
  signedIn: () => !!session,
  aal: () => session ? claims().aal || 'aal1' : null,
  user: () => session?.user || null,
  async signIn(email, password) { save(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false })); },
  async factors() { const u = await call('/auth/v1/user'); session.user = u; save(session); return (u.factors || []).filter(f => f.factor_type === 'totp'); },
  async enrol() { return call('/auth/v1/factors', { method: 'POST', body: { factor_type: 'totp', friendly_name: 'Authenticator app' } }); },
  async verify(factorId, code) {
    const ch = await call(`/auth/v1/factors/${factorId}/challenge`, { method: 'POST', body: {} });
    save(await call(`/auth/v1/factors/${factorId}/verify`, { method: 'POST', body: { challenge_id: ch.id, code: String(code).trim() } }));
  },
  async signOut() { try { await call('/auth/v1/logout', { method: 'POST', body: {} }); } catch (e) {} save(null); },
  /** Arriving from an invitation or password-reset email: Supabase puts the session in the address. */
  fromEmailLink() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (!h.get('access_token') || !['invite', 'recovery'].includes(h.get('type'))) return null;
    save({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), user: null });
    history.replaceState(null, '', location.pathname);
    return h.get('type');
  },
  async setPassword(password) { await call('/auth/v1/user', { method: 'PUT', body: { password } }); },
  async sendReset(email) { await call('/auth/v1/recover', { method: 'POST', body: { email, redirect_to: location.origin + '/' }, auth: false }); },
};

const enc = v => encodeURIComponent(v);
/** Read rows: select('incidents', { company_id: 'eq.x', order: 'occurred_at.desc', limit: 50 }) */
export async function select(table, params = {}) {
  const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  return call(`/rest/v1/${table}?select=*${q ? '&' + q : ''}`);
}
/** Call a database function (all writes go through these). */
export async function rpc(fn, args = {}) { return call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args }); }
/** Call an edge function (e.g. invite-user, which needs the service key on the server). */
export async function fn(name, body) { return call(`/functions/v1/${name}`, { method: 'POST', body }); }
