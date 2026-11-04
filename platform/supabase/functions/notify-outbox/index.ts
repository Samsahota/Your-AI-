// Processes pending customer notifications: ensures the contact has a portal login, creates a single-use
// magic link (expiry is the project's Auth OTP expiry — set it to 24h), and emails it via Resend.
// Triggered every minute by pg_cron (x-cron-secret) or manually by a director.
import { handler, admin, json, isCron, caller, env, APP_URL, activity } from '../_shared/runtime.ts';
import { deliveryEmail } from '../_shared/pure.ts';

Deno.serve(handler(async (req) => {
  if (!isCron(req)) await caller(req, ['director', 'operations']);
  const db = admin();
  const { data: pending } = await db.from('notifications').select('*').eq('status', 'pending').order('created_at').limit(25);
  const results: unknown[] = [];
  for (const n of pending ?? []) {
    try {
      const [{ data: c }, { data: j }, { data: t }] = await Promise.all([
        db.from('contacts').select('*').eq('tenant_id', n.tenant_id).eq('id', n.contact_id).single(),
        db.from('jobs').select('id, dest, customer_ref, delivered_at').eq('tenant_id', n.tenant_id).eq('id', n.job_id).single(),
        db.from('tenants').select('name, settings').eq('id', n.tenant_id).single(),
      ]);
      if (!c.notify) { await db.from('notifications').update({ status: 'suppressed' }).eq('id', n.id); continue; }
      // portal login for the contact (role customer, scoped to this contact)
      let userId = c.user_id as string | null;
      if (!userId) {
        const { data: created, error } = await db.auth.admin.createUser({ email: c.email, email_confirm: true, user_metadata: { name: c.name } });
        if (error && !/already/i.test(error.message)) throw error;
        userId = created?.user?.id ?? (await db.from('profiles').select('user_id').eq('email', c.email).maybeSingle()).data?.user_id ?? null;
        if (!userId) throw new Error('Could not create a portal login for ' + c.email);
        await db.from('profiles').upsert({ user_id: userId, tenant_id: n.tenant_id, name: c.name, email: c.email, role: 'customer', contact_id: c.id, status: 'active' });
        await db.from('contacts').update({ user_id: userId }).eq('tenant_id', n.tenant_id).eq('id', c.id);
      }
      const { data: link, error: le } = await db.auth.admin.generateLink({ type: 'magiclink', email: c.email, options: { redirectTo: `${APP_URL()}/?next=${encodeURIComponent("portal/job/" + n.job_id)}` } });
      if (le) throw le;
      const mail = deliveryEmail({ contactName: c.name, jobId: j.id, ref: j.customer_ref, dest: j.dest, deliveredAt: j.delivered_at, link: link.properties.action_link, hours: Number(t.settings?.link_hours ?? 24), company: t.name });
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env('MAIL_FROM'), to: [c.email], subject: n.kind === 'delivery' ? mail.subject : n.subject, html: mail.html }),
      });
      if (!r.ok) throw new Error(`Email provider returned ${r.status}: ${await r.text()}`);
      await db.from('notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', n.id);
      await activity(db, n.tenant_id, { name: 'System', role: 'System' }, 'Delivery notification sent', 'job', n.job_id, null, `Email with one-time link sent to ${c.email}`);
      results.push({ id: n.id, status: 'sent' });
    } catch (e) {
      await db.from('notifications').update({ status: 'failed', error: String(e instanceof Error ? e.message : e) }).eq('id', n.id);
      results.push({ id: n.id, status: 'failed' });
    }
  }
  return json({ processed: results.length, results });
}));
