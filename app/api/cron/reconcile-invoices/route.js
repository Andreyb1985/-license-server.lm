import { json } from '../../../../lib/http.js';
import { query } from '../../../../lib/db.js';

function authorized(request) {
  const expected = String(process.env.CRON_SECRET || '');
  const header = String(request.headers.get('authorization') || '');
  return Boolean(expected) && header === `Bearer ${expected}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return json({ ok: false, message: 'Unauthorized' }, 401);
  }

  const result = await query(
    `update licenses l
     set status = 'past_due',
         note = trim(both from coalesce(l.note, '') || E'\nInvoice payment is overdue.')
     from subscriptions s
     where l.stripe_subscription_id = s.stripe_subscription_id
       and s.collection_method = 'send_invoice'
       and s.latest_invoice_status = 'open'
       and s.latest_invoice_due_at < now()
       and l.status in ('trialing', 'active', 'expiring_soon')
     returning l.id`,
  );

  return json({ ok: true, marked_past_due: result.rowCount });
}
