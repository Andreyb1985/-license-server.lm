import { json } from '../../../../lib/http.js';
import { query, withTransaction } from '../../../../lib/db.js';
import { getStripe } from '../../../../lib/stripe.js';
import { insertLicense, stripeStatusToLicenseStatus } from '../../../../lib/license.js';

function fromUnix(value) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function upsertCustomer(client, { email, companyName, stripeCustomerId }) {
  const result = await client.query(
    `insert into customers (email, company_name, stripe_customer_id)
     values ($1,$2,$3)
     on conflict (stripe_customer_id)
     do update set email = coalesce(excluded.email, customers.email), company_name = coalesce(excluded.company_name, customers.company_name)
     returning *`,
    [email || null, companyName || null, stripeCustomerId || null],
  );
  return result.rows[0];
}

async function upsertSubscription(client, customer, subscription) {
  const result = await client.query(
    `insert into subscriptions (
      customer_id, stripe_subscription_id, status, price_id, trial_end, current_period_start,
      current_period_end, cancel_at_period_end, canceled_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (stripe_subscription_id)
    do update set status = excluded.status, price_id = excluded.price_id, trial_end = excluded.trial_end,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end, canceled_at = excluded.canceled_at
    returning *`,
    [
      customer?.id || null,
      subscription.id,
      subscription.status,
      subscription.items?.data?.[0]?.price?.id || null,
      fromUnix(subscription.trial_end),
      fromUnix(subscription.current_period_start),
      fromUnix(subscription.current_period_end),
      !!subscription.cancel_at_period_end,
      fromUnix(subscription.canceled_at),
    ],
  );
  return result.rows[0];
}

async function ensureSubscriptionLicense(client, customer, subscription, email, companyName, machineId) {
  const existing = await client.query(`select * from licenses where stripe_subscription_id = $1 limit 1`, [subscription.id]);
  const status = stripeStatusToLicenseStatus(subscription.status);
  if (existing.rows[0]) {
    await client.query(
      `update licenses set status = $1, current_period_end = $2, stripe_customer_id = $3, activated_machine_id = coalesce(activated_machine_id, $4) where id = $5`,
      [status, fromUnix(subscription.current_period_end), subscription.customer, machineId || null, existing.rows[0].id],
    );
    return;
  }
  await insertLicense({
    customer_id: customer?.id || null,
    type: 'subscription',
    status,
    plan: 'Professional',
    email,
    company_name: companyName,
    seats: 1,
    activated_machine_id: machineId || null,
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    current_period_end: fromUnix(subscription.current_period_end),
    created_by: 'stripe-webhook',
  });
}

async function handleSubscription(subscription) {
  const stripeCustomerId = String(subscription.customer || '');
  const customerObject = await getStripe().customers.retrieve(stripeCustomerId);
  const email = customerObject.email || subscription.metadata?.email || null;
  const companyName = subscription.metadata?.company_name || customerObject.metadata?.company_name || null;
  const machineId = subscription.metadata?.machine_id || null;
  await withTransaction(async (client) => {
    const customer = await upsertCustomer(client, { email, companyName, stripeCustomerId });
    await upsertSubscription(client, customer, subscription);
    await ensureSubscriptionLicense(client, customer, subscription, email, companyName, machineId);
  });
}

async function handleCheckoutSession(session) {
  if (!session.subscription) return;
  const subscription = await getStripe().subscriptions.retrieve(session.subscription);
  if (session.customer_email && !subscription.metadata?.email) {
    subscription.metadata = { ...(subscription.metadata || {}), email: session.customer_email, company_name: session.metadata?.company_name || '' };
  }
  await handleSubscription(subscription);
}

async function markLicenseBySubscription(subscriptionId, status, currentPeriodEnd = null) {
  await query(
    `update licenses set status = $1, current_period_end = coalesce($2, current_period_end) where stripe_subscription_id = $3`,
    [status, currentPeriodEnd, subscriptionId],
  );
}

export async function POST(request) {
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return json({ ok: false, message: `Webhook signature failed: ${error.message}` }, 400);
  }

  try {
    const object = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSession(object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscription(object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscription(object);
        await markLicenseBySubscription(object.id, object.current_period_end && object.current_period_end * 1000 > Date.now() ? 'canceled' : 'expired', fromUnix(object.current_period_end));
        break;
      case 'invoice.payment_succeeded':
        if (object.subscription) await markLicenseBySubscription(object.subscription, 'active', fromUnix(object.lines?.data?.[0]?.period?.end));
        break;
      case 'invoice.payment_failed':
        if (object.subscription) await markLicenseBySubscription(object.subscription, 'past_due');
        break;
      case 'refund.created':
      case 'charge.refunded':
        if (object.customer) {
          await query(`update licenses set status = 'refunded' where stripe_customer_id = $1`, [object.customer]);
        }
        break;
      case 'charge.dispute.created':
        if (object.customer) {
          await query(`update licenses set status = 'disputed' where stripe_customer_id = $1`, [object.customer]);
        }
        break;
      case 'charge.dispute.closed':
        if (object.status === 'won' && object.customer) {
          await query(
            `update licenses l set status = 'active'
             from subscriptions s
             where l.stripe_subscription_id = s.stripe_subscription_id and s.status = 'active' and l.stripe_customer_id = $1`,
            [object.customer],
          );
        }
        break;
      default:
        break;
    }
    return json({ received: true });
  } catch (error) {
    return json({ ok: false, message: error.message }, 500);
  }
}
