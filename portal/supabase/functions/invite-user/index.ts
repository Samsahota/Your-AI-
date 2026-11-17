// POST { company_id, name, email, role, division?, job_title?, is_test? }
// A director (or the platform admin) invites someone. Supabase Auth sends the invitation email;
// the profile starts as 'invited' and becomes active after the person sets a password and two-factor.
// Runs on Supabase with the service key, which never reaches the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = Deno.env.get('APP_URL')!;              // e.g. https://portal.clearpathinsights.co.uk
const CORS = { 'Access-Control-Allow-Origin': APP_URL, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  // Not set up yet: refuse rather than send an invitation with a broken link.
  if (!APP_URL || !/^https:\/\//.test(APP_URL)) return new Response(JSON.stringify({ error: 'Invitations are not switched on yet.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const caller = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return reply(401, { error: 'Sign in again.' });
    const payload = JSON.parse(atob(authHeader.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.aal !== 'aal2') return reply(401, { error: 'Sign in with two-factor first.' });

    const b = await req.json();
    const email = String(b.email || '').trim().toLowerCase(), name = String(b.name || '').trim();
    if (!name) return reply(400, { error: "Enter the person's name." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: 'Enter a valid email address.' });

    const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
    const { data: inv, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${APP_URL}/`, data: { name } });
    if (error) return reply(400, { error: /already been registered/i.test(error.message) ? 'Someone with that email already has a login.' : error.message });

    // The database checks the inviter is allowed (director of that company, or platform admin) and logs it.
    const { error: pe } = await admin.rpc('add_profile_for_invite', {
      p_inviter: user.id, p_user: inv.user.id, p_company: b.company_id, p_role: b.role, p_name: name, p_email: email,
      p_job_title: b.job_title || null, p_division: b.division || null, p_is_test: !!b.is_test,
    });
    if (pe) { await admin.auth.admin.deleteUser(inv.user.id); return reply(400, { error: pe.message }); }
    return reply(200, { user_id: inv.user.id, invited: email });
  } catch (e) {
    return reply(500, { error: 'The invitation could not be sent. Try again, or contact Your AI.' });
  }
});
