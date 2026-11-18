// App shell: sign-in with two-factor, the menu, page routing, the dashboard and My account.
import { auth, rpc, select, ApiError } from './api.js';
import { esc, pill, fmtValue, bullseye, measureRows, toast, namer, date, todayUK, target, icon, iconTile, logo, ring, meter, figureTile, raiseBtn, statusColour, STATUS, QICON, QUAD } from './ui.js';
import { loadActions, counts, actionRows, actionsPage, installActionHandlers, myId } from './actions.js';
import { PAGES } from './pages.js';
import { MANAGE } from './manage.js';

const $ = s => document.querySelector(s);
const app = $('#app');
export const ctx = { profile: null, access: null, dash: null, company: null, day: null, noFigures: false, isAdmin: false, name: namer(false) };

// Company-scoped read: always filtered to the company in view (the database also enforces it).
export const q = (table, params = {}) => select(table, { company_id: `eq.${ctx.company}`, ...params });
export const level = area => ctx.access?.areas?.[area] || 'none';
export const isManager = () => ctx.isAdmin || ['director', 'operations', 'consultant'].includes(ctx.profile?.role);

// ---------------------------------------------------------------- sign-in
function signInScreen(msg) {
  app.innerHTML = `<main class="auth"><form class="card auth-card" id="signin" novalidate>
    <div class="auth-brand">${logo()}<span class="brand-word">Clearpath</span></div><h1>Sign in</h1>
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
    app.innerHTML = `<main class="auth"><form class="card auth-card" id="mfa" novalidate><div class="auth-brand">${logo()}<span class="brand-word">Clearpath</span></div><h1>Enter your code</h1>
      <p class="sub">Open your authenticator app and enter the six-digit code for Clearpath.</p>
      <label class="fld" for="code"><span>Code</span><input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>
      <p class="form-error" role="alert" hidden></p><button class="btn primary wide" type="submit">Sign in</button>
      <button class="btn ghost wide" type="button" id="cancel">Use a different account</button></form></main>`;
    return codeForm(verified.id);
  }
  const f = await auth.enrol();
  app.innerHTML = `<main class="auth"><form class="card auth-card" id="mfa" novalidate><div class="auth-brand">${logo()}<span class="brand-word">Clearpath</span></div><h1>Set up two-factor sign-in</h1>
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
    <div class="auth-brand">${logo()}<span class="brand-word">Clearpath</span></div><h1>${kind === 'invite' ? 'Welcome: choose a password' : 'Choose a new password'}</h1>
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
  if (ctx.isAdmin) ctx.companies = await select('companies', { order: 'name.asc' });
  installActionHandlers();
  await Promise.all([loadDashboard(), loadActions()]);
  window.onhashchange = route;
  if (!location.hash) location.hash = ctx.isAdmin && !ctx.company ? '#/admin/companies' : '#/dashboard';
  route();
}

/** The dashboard for the chosen day and view, plus each figure's last 14 days for the trend lines. */
export async function loadDashboard() {
  ctx.dash = null; ctx.day = null; ctx.noFigures = false; ctx.trend = {};
  if (!ctx.company) return;
  const args = { p_company: ctx.isAdmin ? ctx.company : null, p_day: ctx.pickDay || null, p_scope: ctx.scope && ctx.scope !== 'all' ? ctx.scope : null };
  ctx.dash = await rpc('dashboard', args);
  // No figures yet (a new company before its systems are connected): pages work from today instead.
  ctx.noFigures = !ctx.dash.day;
  ctx.day = ctx.dash.day || todayUK();
  if (!ctx.noFigures) ctx.trend = await rpc('measure_trend', { p_days: 14, p_company: args.p_company, p_scope: args.p_scope, p_to: ctx.dash.day });
}

/** Reload what changed (figures and actions) and redraw the current page. */
export async function refresh() { await Promise.all([loadDashboard(), loadActions()]); route(); }

export async function openCompany(id) {
  ctx.company = id; ctx.pickDay = null; ctx.scope = 'all'; sessionStorage.setItem('portal.company', id);
  await Promise.all([loadDashboard(), loadActions()]); location.hash = '#/dashboard'; route();
}

function blocked(msg) {
  app.innerHTML = `<main class="auth"><div class="card auth-card"><div class="auth-brand">${logo()}<span class="brand-word">Clearpath</span></div><h1>Can't open Clearpath</h1><p>${esc(msg)}</p>
    <button class="btn ghost wide" id="out">Sign out</button></div></main>`;
  $('#out').onclick = async () => { await auth.signOut(); signInScreen(); };
}

// ---------------------------------------------------------------- layout and routing
const MENU = [
  ['dashboard', 'Dashboard', 'dashboard'], ['actions', 'Actions', null], ['hs', 'Health and Safety', 'hs'], ['service', 'Service', 'service'], ['cost', 'Cost', 'cost'],
  ['people', 'People', 'people'], ['compliance', 'Compliance', 'compliance'], ['records', 'Records', 'records'], ['links', 'Links', null],
];
const MENU_ICON = { dashboard: 'home', actions: 'flag', hs: 'shield', service: 'truck', cost: 'chart', people: 'people', compliance: 'clipboard', records: 'table', links: 'link' };
const SYSTEM = { vigo: 'Vigo', tachomaster: 'Tachomaster', falcon: 'Falcon Tracking', predrive: 'PreDrive', xero: 'Xero', sharepoint: 'SharePoint', brightpay: 'BrightPay', bibby: 'Bibby', warehouse: 'Warehouse figures', other: 'Other' };
const SYSTEM_ORDER = ['vigo', 'tachomaster', 'falcon', 'predrive', 'xero', 'sharepoint', 'brightpay', 'bibby', 'warehouse', 'other'];
const CONN = { connected: ['green', 'Connected'], failing: ['red', 'Failing'], waiting_access: ['no_data', 'Waiting for access'], configured: ['no_target', 'Set up, first run due'], paused: ['no_data', 'Paused'] };
const ukNow = opts => new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', ...opts });
const initials = n => String(n || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

function layout(active) {
  const p = ctx.profile; const c = counts();
  const company = ctx.dash?.company || (ctx.isAdmin ? 'All companies' : p.company || '');
  const link = (k, label, href, ic, extra = '') =>
    `<a class="nav-item ${active === k ? 'on' : ''}" href="${href}" ${active === k ? 'aria-current="page"' : ''}>${icon(ic)}<span class="nv">${label}</span>${extra}</a>`;
  const items = ctx.company ? MENU.map(([k, l, area]) => {
    const lv = area ? level(area) : 'full';
    if (lv === 'none') return `<span class="nav-item off" aria-disabled="true">${icon(MENU_ICON[k])}<span class="nv">${l}</span><small>No access</small></span>`;
    const extra = k === 'actions' ? (c.mine ? `<span class="count ${c.mineOverdue ? 'bad' : ''}" title="Assigned to you">${c.mine}</span>` : '') : lv === 'own' ? '<small>Own area</small>' : '';
    return link(k, l, `#/${k}`, MENU_ICON[k], extra);
  }).join('') : '';
  const manage = [
    level('settings') === 'full' && ctx.company ? link('settings', 'Users and settings', '#/settings/users', 'sliders') : '',
    ctx.isAdmin ? link('admin', 'Admin console', '#/admin/companies', 'server') : '',
    link('me', 'My account', '#/me', 'user'),
  ].join('');
  const conns = ctx.dash?.connections;
  const connected = conns ? conns.filter(x => x.status === 'connected').length : 0;
  const foot = conns && conns.length ? `<div class="side-foot"><a class="conn-meter" href="${ctx.isAdmin ? '#/admin/connections' : '#/settings/connections'}">
      <span class="row"><span>Data connections</span><b>${connected} / ${conns.length}</b></span><span class="meter">${meter(connected / conns.length)}</span>
      <small>${connected === conns.length ? 'Every system is feeding Clearpath.' : connected ? `${conns.length - connected} still to connect.` : 'Waiting for supplier access.'}</small></a></div>` : '<div class="side-foot"></div>';
  app.innerHTML = `<div class="shell">
    <nav class="side" id="side" aria-label="Menu">
      <div class="brand">${logo()}<span class="brand-mark"><span class="brand-word">Clearpath</span><span class="brand-sub">${esc(company)}</span></span>
        <button class="menu-btn" id="menu-btn" type="button" aria-expanded="false" aria-controls="side">${icon('menu')}Menu</button></div>
      ${items ? `<p class="nav-label">Overview</p><div class="nav">${items}</div>` : ''}
      <p class="nav-label">Manage</p><div class="nav">${manage}</div>
      ${foot}
    </nav>
    <div class="content"><header class="topbar">${topBar()}</header>
      <main class="main" id="main" tabindex="-1"><p class="loading">Loading…</p></main></div></div>`;
  $('#menu-btn').onclick = () => { const open = $('#side').classList.toggle('open'); $('#menu-btn').setAttribute('aria-expanded', String(open)); };
  $('#signout').onclick = () => signOutNow();
  const sw = $('#company-switch'); if (sw) sw.onchange = () => { if (sw.value) openCompany(sw.value); };
  const dd = $('#user-dd');
  if (dd) dd.addEventListener('toggle', () => { if (dd.open) setTimeout(() => document.addEventListener('click', function close(e) { if (!dd.contains(e.target)) { dd.open = false; document.removeEventListener('click', close); } }), 0); });
}

// The bar above every page: can the figures be trusted right now, how much is connected, a company
// switcher for the platform admin, and the user menu.
function topBar() {
  const d = ctx.dash; const p = ctx.profile; let chip;
  if (!d) chip = `<span class="status-chip"><i></i>${ctx.isAdmin ? 'Choose a company' : 'No company open'}</span>`;
  else if (!d.day) chip = `<span class="status-chip warn"><i></i>Waiting for data</span>`;
  else if (d.stale_sources.length) chip = `<span class="status-chip bad"><i></i>Some figures not updated</span>`;
  else chip = `<span class="status-chip ok"><i></i>Live · figures for ${date(d.day)}</span>`;
  const conns = d?.connections;
  const connChip = conns && conns.length ? `<span class="status-chip">${icon('plug')}${conns.filter(c => c.status === 'connected').length} of ${conns.length} systems connected</span>` : '';
  const switcher = ctx.isAdmin && ctx.companies?.length ? `<label class="ctl" for="company-switch"><span class="sr">Company</span><select class="select" id="company-switch">
      ${ctx.company ? '' : '<option value="">Choose a company</option>'}${ctx.companies.map(c => `<option value="${c.id}" ${c.id === ctx.company ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : '';
  return `${chip}${connChip}<span class="grow"></span><span class="when">${icon('calendar')}${ukNow({ weekday: 'short', day: 'numeric', month: 'short' })}</span>${switcher}
    <details class="dd" id="user-dd"><summary class="dd-btn" aria-label="Your account"><span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span><span>${esc(p.name.split(/\s+/)[0])}</span>${icon('chevron').replace('class="i"', 'class="i chev"')}</summary>
      <div class="dd-menu"><div class="who"><b>${esc(p.name)}</b><span>${esc(roleName(p.role))}${p.company ? ` · ${esc(p.company)}` : ''}</span></div>
        <a href="#/me">${icon('user')}My account</a>${level('settings') === 'full' && ctx.company ? `<a href="#/settings/users">${icon('sliders')}Users and settings</a>` : ''}
        <button type="button" id="signout">${icon('signout')}Sign out</button></div></details>`;
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
    else if (key === 'dashboard') { main.innerHTML = dashboard(); bindDashboard(); }
    else if (key === 'actions') await actionsPage(main);
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
  const d = ctx.dash; const p = ctx.profile; const tr = ctx.trend || {}; const c = counts();
  const heads = d.measures.filter(m => m.headline);
  const by = s => d.measures.filter(m => m.status === s).length;
  const reds = by('red'), ambers = by('amber'), greens = by('green'), waiting = d.measures.length - reds - ambers - greens;
  const hour = Number(ukNow({ hour: 'numeric', hour12: false }));
  const first = p.name && p.name !== roleName(p.role) ? `, ${p.name.split(/\s+/)[0]}` : '';
  const conns = d.connections?.length ? d.connections : null; const connected = conns ? conns.filter(x => x.status === 'connected').length : 0;
  const firstRed = d.measures.find(m => m.status === 'red');
  const raiseFor = (m, label) => raiseBtn({ area: m.quadrant, title: `${m.name} is ${STATUS[m.status].toLowerCase()} at ${fmtValue(m.value, m.unit)}`, linkKind: 'measure', linkId: m.code, linkLabel: m.name, priority: m.status === 'red' ? 'high' : 'medium' }, label);

  const controls = `${d.can_switch_scope ? `<label class="ctl" for="scope"><span>View</span><select class="select" id="scope">
        ${[['all', 'Whole company'], ['transport', 'Transport only'], ['warehouse', 'Warehouse only']].map(([v, l]) => `<option value="${v}" ${d.scope === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      <label class="ctl" for="day"><span>Figures for</span><select class="select" id="day" ${d.days.length ? '' : 'disabled'}>
        ${d.days.length ? d.days.map(x => `<option value="${x}" ${x === d.day ? 'selected' : ''}>${date(x)}</option>`).join('') : '<option>No figures yet</option>'}</select></label>
      <button class="btn primary" type="button" data-raise="{}">${icon('flag')}Raise action</button>`;

  let summary;
  if (!d.day) summary = `<section class="card summary info">${iconTile('plug')}<p><b>No figures yet.</b> They appear here as each of ${esc(d.company)}'s systems is connected${conns ? `: ${connected} of ${conns.length} so far` : ''}. Until then every figure shows "Waiting for data", and nothing is estimated.</p></section>`;
  else if (reds || ambers) summary = `<section class="card summary ${reds ? 'bad' : 'warn'}">${iconTile('alert', reds ? 'red' : 'amber')}<p>${reds ? `<b>${reds} figure${reds === 1 ? '' : 's'} need${reds === 1 ? 's' : ''} action</b>` : ''}${reds && ambers ? ' and ' : ''}${ambers ? `<b>${ambers} to watch</b>` : ''}${firstRed ? `, led by ${esc(firstRed.name.toLowerCase())} at <b>${fmtValue(firstRed.value, firstRed.unit)}</b>` : ''}.${d.stale_sources.length ? ' Some figures are not updated because a connection is failing.' : ''}</p>${firstRed ? raiseFor(firstRed) : ''}</section>`;
  else summary = `<section class="card summary ok">${iconTile('check', 'green')}<p><b>Everything you can see is on target</b> for ${date(d.day)}.</p></section>`;

  const stat = (inner, href) => href ? `<a class="card stat" href="${href}">${inner}</a>` : `<div class="card stat">${inner}</div>`;
  const stats = `<div class="stats">
    ${stat(`${ring([{ value: greens, colour: statusColour('green') }, { value: ambers, colour: statusColour('amber') }, { value: reds, colour: statusColour('red') }, { value: waiting, colour: '#CBD5E1' }], { label: d.day ? `${greens}/${d.measures.length}` : '—' })}
      <div class="tx"><div class="l">Figures on target</div><div class="n">${d.day ? greens : '—'}<small>of ${d.measures.length}</small></div><div class="f">${d.day ? `<b class="bad">${reds} red</b> · ${ambers} amber` : 'Waiting for data'}</div></div>`)}
    ${stat(`${iconTile('alert', reds ? 'red' : ambers ? 'amber' : 'none', 'lg')}<div class="tx"><div class="l">Needs action</div><div class="n">${d.day ? reds + ambers : '—'}</div><div class="f">${d.day ? `${reds} red, ${ambers} amber` : 'Nothing to flag yet'}</div></div>`)}
    ${stat(`${iconTile('flag', 'actions', 'lg')}<div class="tx"><div class="l">Open actions</div><div class="n">${c.open}</div><div class="f">${c.overdue ? `<b class="bad">${c.overdue} overdue</b>` : 'None overdue'} · ${c.mine} yours</div></div>`, '#/actions')}
    ${conns ? stat(`${ring([{ value: connected, colour: '#2F6BFF' }, { value: conns.length - connected, colour: '#E3E7EF' }], { label: `${connected}/${conns.length}` })}<div class="tx"><div class="l">Systems connected</div><div class="n">${connected}<small>of ${conns.length}</small></div><div class="f">${connected === conns.length ? 'All feeding Clearpath' : 'Waiting for supplier access'}</div></div>`, level('settings') === 'full' ? '#/settings/connections' : null)
      : stat(`${iconTile('calendar', '', 'lg')}<div class="tx"><div class="l">Figures for</div><div class="n">${d.day ? new Date(d.day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</div><div class="f">${d.day ? 'Latest day with figures' : 'Waiting for data'}</div></div>`)}
  </div>`;

  const attnList = d.measures.filter(m => m.status === 'red' || m.status === 'amber').sort((a, b) => (a.status === 'red' ? 0 : 1) - (b.status === 'red' ? 0 : 1));
  const attn = `<section class="card flush"><div class="card-head"><div class="t">${iconTile('alert', attnList.length ? 'red' : 'none', 'sm')}<h2>Requires attention</h2></div><span class="note">${attnList.length} open</span></div>
    ${attnList.length ? `<ul class="rows">${attnList.map(m => `<li><span class="dot ${m.status}"></span><div class="tx"><a href="#/${m.quadrant}"><b>${esc(m.name)}: ${fmtValue(m.value, m.unit)}</b></a><small>${esc(QUAD[m.quadrant])} · ${esc(target(m))}</small></div>
        <div class="side-info">${pill(m.status)}${raiseFor(m, 'Action')}</div></li>`).join('')}</ul>`
      : `<div class="empty-state">${iconTile(d.day ? 'check' : 'pulse', d.day ? 'green' : 'none')}<b>${d.day ? 'Nothing red or amber' : 'Nothing to flag yet'}</b><span>${d.day ? 'Every figure you can see is on target.' : 'Red and amber figures will be listed here, each with a button to raise an action.'}</span></div>`}</section>`;
  const me = myId();
  const mine = (ctx.actions || []).filter(a => a.status === 'open' && a.owner === me).slice(0, 6);
  const yours = `<section class="card flush"><div class="card-head"><div class="t">${iconTile('flag', 'actions', 'sm')}<h2>Your actions</h2></div><a href="#/actions">All actions</a></div>${actionRows(mine, 'Nothing assigned to you')}</section>`;
  const sysTiles = conns ? `<section class="card flush"><div class="card-head"><div class="t">${iconTile('plug', '', 'sm')}<h2>Data connections</h2></div>${level('settings') === 'full' ? `<a href="#/settings/connections">Manage</a>` : ''}</div>
    <div class="sys">${[...conns].sort((a, b) => SYSTEM_ORDER.indexOf(a.system) - SYSTEM_ORDER.indexOf(b.system)).map(x => { const [s, l] = CONN[x.status] || ['no_data', x.status]; const nm = SYSTEM[x.system] || x.system;
      return `<div class="sys-tile"><span class="mono c${SYSTEM_ORDER.indexOf(x.system) % 9}" aria-hidden="true">${esc(nm.replace(/[^A-Za-z]/g, '').slice(0, 2))}</span><div class="tx"><b>${esc(nm)}</b><small>${esc(x.label)}</small>${pill(s, l)}</div></div>`; }).join('')}</div></section>` : '';

  return `<header class="page-head"><div><p class="eyebrow">${icon('calendar')}${ukNow({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${esc(d.company)}${d.scope !== 'all' ? ` · ${esc(d.scope)} view` : ''}</p>
      <h1>${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}${esc(first)}</h1></div><div class="head-actions">${controls}</div></header>
    ${summary}${stats}
    <section class="card"><div class="overview"><div>${bullseye(d.quadrants)}
      <div class="legend"><span><i class="g"></i>On target</span><span><i class="a"></i>Watch</span><span><i class="r"></i>Action needed</span><span><i class="n"></i>Waiting for data</span></div></div>
      <div><h2>Headline figures</h2><p class="sub below">${d.day ? `${date(d.day)} · trend over the last 14 days` : 'Waiting for data'}</p>
        <div class="tiles">${heads.map(m => figureTile(m, tr[m.code])).join('') || '<p class="empty">No headline figures for your login.</p>'}</div></div></div></section>
    <div class="grid2">${attn}${yours}</div>
    <div class="sec-title"><h2>By area</h2><span class="sub">Every figure you can see, against its target</span></div>
    <div class="quads">${Object.keys(QUAD).filter(k => d.quadrants[k].status !== 'no_access').map(k => `<section class="card area-card"><div class="qhead"><div class="t">${iconTile(QICON[k], k, 'sm')}<h2><a href="#/${k}">${QUAD[k]}</a></h2></div>${pill(d.quadrants[k].status)}</div>${measureRows(d.measures.filter(m => m.quadrant === k))}</section>`).join('')}</div>
    ${sysTiles}`;
}
function bindDashboard() {
  const sc = $('#scope'); if (sc) sc.onchange = async () => { ctx.scope = sc.value; await loadDashboard(); route(); };
  const dy = $('#day'); if (dy) dy.onchange = async () => { ctx.pickDay = dy.value; await loadDashboard(); route(); };
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
  Object.assign(ctx, { profile: null, access: null, dash: null, company: null, day: null, noFigures: false, isAdmin: false, name: namer(false), actions: [], trend: {}, scope: 'all', pickDay: null, companies: null });
  history.replaceState(null, '', location.pathname + location.search);
  signInScreen(msg);
}

start().catch(x => signInScreen(x.message));
