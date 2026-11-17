// App shell: sign-in with two-factor, the menu, page routing, the dashboard and My account.
import { auth, rpc, select, ApiError } from './api.js';
import { esc, pill, fmtValue, bullseye, measureRows, toast, namer, date, todayUK, QUAD } from './ui.js';
import { PAGES } from './pages.js';
import { MANAGE } from './manage.js';

const $ = s => document.querySelector(s);
const app = $('#app');
export const ctx = { profile: null, access: null, dash: null, company: null, day: null, isAdmin: false, name: namer(false) };

// Company-scoped read: always filtered to the company in view (the database also enforces it).
export const q = (table, params = {}) => select(table, { company_id: `eq.${ctx.company}`, ...params });
export const level = area => ctx.access?.areas?.[area] || 'none';
export const isManager = () => ctx.isAdmin || ['director', 'operations', 'consultant'].includes(ctx.profile?.role);

// ---------------------------------------------------------------- sign-in
function signInScreen(msg) {
  app.innerHTML = `<main class="auth"><form class="card auth-card" id="signin" novalidate>
    <p class="brand">Clearpath</p><h1>Sign in</h1>
    <label class="fld" for="email"><span>Email</span><input id="email" type="email" autocomplete="username" required></label>
    <label class="fld" for="password"><span>Password</span><input id="password" type="password" autocomplete="current-password" required></label>
    <p class="form-error" role="alert" ${msg ? '' : 'hidden'}>${esc(msg || '')}</p>
    <button class="btn primary wide" type="submit">Continue</button>
    <p class="note">You'll be asked for a code from your authenticator app next. <a href="#" id="forgot">Forgot your password?</a></p></form></main>`;
  $('#email').focus();
  $('#forgot').onclick = async e => {
    e.preventDefault(); const err = $('#signin .form-error'); const email = $('#email').value.trim();
    if (!email) { err.textContent = 'Enter your email first, then choose "Forgot your password?".'; err.hidden = false; return; }
    try { await auth.sendReset(email); err.hidden = true; toast('If that email has a login, a reset link is on its way.'); } catch (x) { err.textContent = x.message; err.hidden = false; }
  };
  $('#signin').onsubmit = async e => {
    e.preventDefault(); const err = $('#signin .form-error'); err.hidden = true;
    const email = $('#email').value.trim(), password = $('#password').value;
    if (!email || !password) { err.textContent = 'Enter your email and password.'; err.hidden = false; return; }
    const btn = $('#signin button'); btn.disabled = true;
    try { await auth.signIn(email, password); await twoFactor(); }
    catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  };
}

async function twoFactor() {
  const factors = await auth.factors();
  const verified = factors.find(f => f.status === 'verified');
  if (verified) {
    app.innerHTML = `<main class="auth"><form class="card auth-card" id="mfa" novalidate><h1>Enter your code</h1>
      <p class="sub">Open your authenticator app and enter the six-digit code for Clearpath.</p>
      <label class="fld" for="code"><span>Code</span><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
      <p class="form-error" role="alert" hidden></p><button class="btn primary wide" type="submit">Sign in</button>
      <button class="btn ghost wide" type="button" id="cancel">Use a different account</button></form></main>`;
    return codeForm(verified.id);
  }
  const f = await auth.enrol();
  app.innerHTML = `<main class="auth"><form class="card auth-card" id="mfa" novalidate><h1>Set up two-factor sign-in</h1>
    <p class="sub">Every login is protected with a code from your phone. You only set this up once.</p>
    <ol class="steps"><li>Install <b>Microsoft Authenticator</b> or <b>Google Authenticator</b> on your phone.</li>
    <li>In the app, add an account and scan this code. If you can't scan it, type in the key below.</li></ol>
    <div class="qr"><img src="${esc(f.totp.qr_code)}" alt="QR code for your authenticator app" width="160" height="160"></div>
    <p class="key">Key: <code id="secret">${esc(f.totp.secret.match(/.{1,4}/g).join(' '))}</code></p>
    <label class="fld" for="code"><span>Then enter the six-digit code it shows</span><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
    <p class="form-error" role="alert" hidden></p><button class="btn primary wide" type="submit">Turn on two-factor and sign in</button>
    <button class="btn ghost wide" type="button" id="cancel">Cancel</button></form></main>`;
  return codeForm(f.id);
}

function codeForm(factorId) {
  $('#code').focus();
  $('#cancel').onclick = async () => { await auth.signOut(); signInScreen(); };
  $('#mfa').onsubmit = async e => {
    e.preventDefault(); const err = $('#mfa .form-error'); err.hidden = true;
    const code = $('#code').value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) { err.textContent = 'Enter the six digits from your authenticator app.'; err.hidden = false; return; }
    const btn = $('#mfa [type=submit]'); btn.disabled = true;
    try { await auth.verify(factorId, code); await start(); }
    catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  };
}

// From an invitation or reset email: choose a password, then set up two-factor.
function passwordScreen(kind) {
  app.innerHTML = `<main class="auth"><form class="card auth-card" id="pw" novalidate>
    <h1>${kind === 'invite' ? 'Welcome: choose a password' : 'Choose a new password'}</h1>
    <p class="sub">At least 12 characters. A short sentence is easier to remember than a jumble.</p>
    <label class="fld" for="pw1"><span>New password</span><input id="pw1" type="password" autocomplete="new-password" required></label>
    <label class="fld" for="pw2"><span>Type it again</span><input id="pw2" type="password" autocomplete="new-password" required></label>
    <p class="form-error" role="alert" hidden></p><button class="btn primary wide" type="submit">Save password</button></form></main>`;
  $('#pw1').focus();
  $('#pw').onsubmit = async e => {
    e.preventDefault(); const err = $('#pw .form-error'); err.hidden = true;
    const a = $('#pw1').value, b = $('#pw2').value;
    if (a.length < 12) { err.textContent = 'Use at least 12 characters.'; err.hidden = false; return; }
    if (a !== b) { err.textContent = "The two passwords don't match."; err.hidden = false; return; }
    const btn = $('#pw button'); btn.disabled = true;
    try { await auth.setPassword(a); toast('Password saved'); await twoFactor(); }
    catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  };
}

// ---------------------------------------------------------------- starting the session
async function start() {
  const link = auth.fromEmailLink();
  if (link) return passwordScreen(link);
  if (!auth.signedIn()) return signInScreen();
  if (auth.aal() !== 'aal2') return twoFactor().catch(x => signInScreen(x.message));
  let p = await rpc('my_profile');
  if (!p) return blocked('There is no Clearpath account for this email. Ask your director to invite you.');
  if (p.status === 'invited') { await rpc('accept_invitation'); p = await rpc('my_profile'); }
  if (p.status === 'suspended') return blocked('Your account has been suspended. Contact your director if you think this is a mistake.');
  ctx.profile = p; ctx.isAdmin = p.role === 'platform_admin';
  ctx.access = await rpc('my_access');
  ctx.name = namer(!!p.demo_view);
  ctx.company = ctx.isAdmin ? sessionStorage.getItem('portal.company') : p.company_id;
  await loadDashboard();
  window.onhashchange = route;
  if (!location.hash) location.hash = ctx.isAdmin && !ctx.company ? '#/admin/companies' : '#/dashboard';
  route();
}

export async function loadDashboard() {
  ctx.dash = null; ctx.day = null; ctx.noFigures = false;
  if (!ctx.company) return;
  ctx.dash = await rpc('dashboard', { p_company: ctx.isAdmin ? ctx.company : null });
  // No figures yet (a new company before its systems are connected): pages work from today instead.
  ctx.noFigures = !ctx.dash.day;
  ctx.day = ctx.dash.day || todayUK();
}

export async function openCompany(id) {
  ctx.company = id; sessionStorage.setItem('portal.company', id);
  await loadDashboard(); location.hash = '#/dashboard'; route();
}

function blocked(msg) {
  app.innerHTML = `<main class="auth"><div class="card auth-card"><h1>Can't open Clearpath</h1><p>${esc(msg)}</p>
    <button class="btn ghost wide" id="out">Sign out</button></div></main>`;
  $('#out').onclick = async () => { await auth.signOut(); signInScreen(); };
}

// ---------------------------------------------------------------- layout and routing
const MENU = [
  ['dashboard', 'Dashboard', 'dashboard'], ['hs', 'Health and Safety', 'hs'], ['service', 'Service', 'service'], ['cost', 'Cost', 'cost'],
  ['people', 'People', 'people'], ['compliance', 'Compliance', 'compliance'], ['records', 'Records', 'records'], ['links', 'Links', null],
];

function layout(active) {
  const p = ctx.profile;
  const items = ctx.company ? MENU.map(([k, l, area]) => {
    const lv = area ? level(area) : 'full'; const off = lv === 'none';
    return off ? `<span class="nav-item off" aria-disabled="true">${l}<small>No access</small></span>`
      : `<a class="nav-item ${active === k ? 'on' : ''}" href="#/${k}">${l}${lv === 'own' ? '<small>Own area</small>' : ''}</a>`;
  }).join('') : '';
  const manage = [
    level('settings') === 'full' && ctx.company ? `<a class="nav-item ${active === 'settings' ? 'on' : ''}" href="#/settings/users">Users and settings</a>` : '',
    ctx.isAdmin ? `<a class="nav-item ${active === 'admin' ? 'on' : ''}" href="#/admin/companies">Admin console</a>` : '',
    `<a class="nav-item ${active === 'me' ? 'on' : ''}" href="#/me">My account</a>`,
  ].join('');
  app.innerHTML = `<div class="shell">
    <nav class="side" aria-label="Menu"><p class="brand side-brand">Clearpath</p><div class="co"><b>${esc(ctx.dash?.company || (ctx.isAdmin ? 'All companies' : p.company || ''))}</b>
      <span>${esc(p.name)} · ${esc(roleName(p.role))}${p.demo_view ? ' · demo view' : ''}</span></div>
      ${items}<div class="sep"></div>${manage}<button class="nav-item btn-link" id="signout" type="button">Sign out</button></nav>
    <main class="main" id="main" tabindex="-1"><p class="loading">Loading…</p></main></div>`;
  $('#signout').onclick = () => signOutNow();
}

export const roleName = r => ({ platform_admin: 'Platform admin', director: 'Director', consultant: 'Consultant', operations: 'Operations Manager', transport: 'Transport Manager', warehouse: 'Warehouse Manager' }[r] || r);

async function route() {
  if (!auth.signedIn() || !ctx.profile) return signInScreen();
  const [page, tab] = location.hash.replace(/^#\//, '').split('/');
  const key = page || 'dashboard';
  layout(['settings', 'admin', 'me'].includes(key) ? key : key);
  const main = $('#main');
  try {
    if (key === 'me') main.innerHTML = myAccount();
    else if (key === 'admin' && ctx.isAdmin) await MANAGE.admin(main, tab || 'companies');
    else if (key === 'settings' && level('settings') === 'full') await MANAGE.settings(main, tab || 'users');
    else if (!ctx.company) main.innerHTML = `<section class="card"><h1>Choose a company</h1><p class="sub">Open a company from the admin console to see its dashboard and pages.</p><a class="btn primary" href="#/admin/companies">Open the admin console</a></section>`;
    else if (MENU.some(m => m[0] === key && m[2] && level(m[2]) === 'none')) main.innerHTML = `<section class="card"><h1>No access</h1><p>Your login doesn't include this page. Your director can change access levels if you need it.</p><a href="#/dashboard">Back to the dashboard</a></section>`;
    else if (key === 'dashboard') main.innerHTML = dashboard();
    else if (PAGES[key]) await PAGES[key](main, tab);
    else main.innerHTML = `<section class="card"><h1>Page not found</h1><a href="#/dashboard">Back to the dashboard</a></section>`;
  } catch (x) {
    main.innerHTML = `<section class="card"><h1>Something went wrong</h1><p>${esc(x.message)}</p><p class="note">If this keeps happening, tell Your AI what you were doing.</p></section>`;
    if (!(x instanceof ApiError)) console.error(x);
  }
  if (key === 'me') bindMyAccount();
  main.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- dashboard
function dashboard() {
  const d = ctx.dash;
  const heads = d.measures.filter(m => m.headline);
  const stale = d.stale_sources.length ? `<p class="banner warn">Some figures are not updated because a connection is failing. They are greyed out until it is fixed.</p>` : '';
  return `<header class="page-head"><div><h1>Dashboard</h1><p class="sub">${esc(d.company)} · ${d.day ? `figures for ${date(d.day)}` : 'no figures yet: they appear here once its systems are connected'}</p></div></header>${stale}
    <section class="card"><div class="dash"><div>${bullseye(d.quadrants)}
      <p class="note center">Click any part to open its page. * means some figures have no data or no target yet.</p></div>
      <div><h2>Headline figures</h2><div class="heads">${heads.map(m => `<a class="tile" href="#/${m.quadrant}"><span class="l">${esc(m.name)}</span><span class="n">${fmtValue(m.value, m.unit)}</span>${pill(m.status)}</a>`).join('') || '<p class="empty">No headline figures for your login.</p>'}</div>
      <h2 class="mt">Needs attention</h2>${attention(d)}</div></div></section>
    <div class="quads">${Object.keys(QUAD).map(k => `<section class="card"><div class="qhead"><h2><a href="#/${k}">${QUAD[k]}</a></h2>${pill(d.quadrants[k].status)}</div>${measureRows(d.measures.filter(m => m.quadrant === k))}</section>`).join('')}</div>`;
}

function attention(d) {
  const reds = d.measures.filter(m => m.status === 'red' || m.status === 'amber').sort((a, b) => (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));
  if (!reds.length) return `<p class="empty">Nothing red or amber for your login.</p>`;
  return `<ul class="attn">${reds.map(m => `<li><a href="#/${m.quadrant}">${pill(m.status)} <span>${esc(m.name)}: <b>${fmtValue(m.value, m.unit)}</b></span></a></li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------- my account
function myAccount() {
  const p = ctx.profile;
  return `<header class="page-head"><div><h1>My account</h1></div></header>
    <section class="card"><dl class="facts"><dt>Name</dt><dd>${esc(p.name)}</dd><dt>Email</dt><dd>${esc(p.email)}</dd><dt>Role</dt><dd>${esc(roleName(p.role))}${p.division ? ` (${esc(p.division)})` : ''}</dd>
      <dt>Company</dt><dd>${esc(p.company || 'All companies')}</dd><dt>Two-factor sign-in</dt><dd>On</dd></dl></section>
    <section class="card"><h2>Demo view</h2><p class="sub">Hides staff names on your screens (people show as "Employee 1", "Driver 2" and so on), for showing the platform to other hauliers. It only changes your own view.</p>
      <label class="switch" for="demo"><input type="checkbox" id="demo" ${p.demo_view ? 'checked' : ''}> <span>Hide staff names on my screens</span></label></section>`;
}
function bindMyAccount() {
  const box = $('#demo'); if (!box) return;
  box.onchange = async () => {
    try { await rpc('set_demo_view', { p_on: box.checked }); ctx.profile.demo_view = box.checked; ctx.name = namer(box.checked); toast(box.checked ? 'Demo view on: staff names hidden' : 'Demo view off'); layout('me'); route(); }
    catch (x) { toast(x.message, 'error'); box.checked = !box.checked; }
  };
}

// ---------------------------------------------------------------- automatic sign-out
// After 30 minutes without a click, key press or scroll, the session ends and the screen clears,
// so an unattended office PC doesn't stay signed in.
const IDLE_MINUTES = 30;
let lastActive = Date.now();
['click', 'keydown', 'scroll', 'pointermove', 'touchstart'].forEach(ev => addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
setInterval(async () => {
  if (auth.signedIn() && Date.now() - lastActive > IDLE_MINUTES * 60000) {
    await signOutNow(`You were signed out after ${IDLE_MINUTES} minutes without activity.`);
  }
}, 30000);

// Ends the session and forgets everything held in memory, so nothing from the last person is redrawn.
async function signOutNow(msg) {
  window.onhashchange = null;
  await auth.signOut(); sessionStorage.removeItem('portal.company');
  Object.assign(ctx, { profile: null, access: null, dash: null, company: null, day: null, noFigures: false, isAdmin: false, name: namer(false) });
  history.replaceState(null, '', location.pathname + location.search);
  signInScreen(msg);
}

start().catch(x => signInScreen(x.message));
