// POST { name, email, role, sections?, can_view_money? } — director invites a staff member.
// Supabase Auth sends the invitation email; the profile starts as 'invited' and activates on first sign-in.
import { handler, caller, admin, json, HttpError, APP_URL, activity } from '../_shared/runtime.ts';

Deno.serve(handler(async (req) => {
  const me = await caller(req, ['director']);
  const b = await req.json();
  const name = String(b.name || '').trim(), email = String(b.email || '').trim().toLowerCase(), role = String(b.role || '');
  if (!name) throw new HttpError(400, "Enter the person's name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (!['director', 'operations', 'transport', 'viewonly', 'driver'].includes(role)) throw new HttpError(400, 'Choose a role.');
  const sections: string[] = role === 'viewonly' ? (b.sections || []).filter((s: string) => ['jobs', 'operations', 'cash', 'fleet'].includes(s)) : [];
  if (role === 'viewonly' && !sections.length) throw new HttpError(400, 'Choose at least one section a View Only user can see.');
  if (role === 'driver' && !b.driver_id) throw new HttpError(400, 'Choose which driver record this login belongs to.');
  const db = admin();
  const { data: exists } = await db.from('profiles').select('user_id').eq('tenant_id', me.tenantId).ilike('email', email).maybeSingle();
  if (exists) throw new HttpError(409, 'Someone with that email is already on the team.');
  const { data: inv, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${APP_URL()}/?next=accept`, data: { name } });
  if (error) throw new HttpError(400, error.message);
  const canMoney = role === 'viewonly' ? !!b.can_view_money : false;
  const { error: pe } = await db.from('profiles').insert({ user_id: inv.user.id, tenant_id: me.tenantId, name, email, role, title: b.title || null,
    sections, can_view_money: canMoney, driver_id: role === 'driver' ? b.driver_id : null, status: 'invited', invited_by: me.userId });
  if (pe) throw new HttpError(400, pe.message);
  await activity(db, me.tenantId, { id: me.userId, name: me.name, role: 'Director' }, 'Invited user', 'user', inv.user.id, null, `${name} as ${role} (invitation email sent)`);
  return json({ ok: true, user_id: inv.user.id });
}));
