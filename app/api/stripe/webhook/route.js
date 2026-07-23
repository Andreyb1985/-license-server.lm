import { json } from '../../../../lib/http.js';
import { query, withTransaction } from '../../../../lib/db.js';
import { getStripe } from '../../../../lib/stripe.js';
import { findActiveTrialLicense, findBillableSubscriptionLicense, insertLicense, stripeStatusToLicenseStatus } from '../../../../lib/license.js';
import {
  invoiceDueAt,
  invoiceLicenseStatus,
  stripeSubscriptionId,
} from '../../../../lib/invoice.js';

function fromUnix(value) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function upsertCustomer(client, { email, companyName, stripeCustomerId, licenseeAddress, licenseeCompanyNumber }) {
  const result = await client.query(
    `insert into customers (email, company_name, stripe_customer_id, licensee_address, licensee_company_number)
     values ($1,$2,$3,$4,$5)
     on conflict (stripe_customer_id)
     do update set email = coalesce(excluded.email, customers.email),
       company_name = coalesce(excluded.company_name, customers.company_name),
       licensee_address = coalesce(excluded.licensee_address, customers.licensee_address),
       licensee_company_number = coalesce(excluded.licensee_company_number, customers.licensee_company_number)
     returning *`,
    [email || null, companyName || null, stripeCustomerId || null, licenseeAddress || null, licenseeCompanyNumber || null],
  );
  return result.rows[0];
}

async function upsertSubscription(client, customer, subscription) {
  const result = await client.query(
    `insert into subscriptions (
      customer_id, stripe_subscription_id, status, price_id, trial_end, current_period_start,
      current_period_end, cancel_at_period_end, canceled_at, collection_method, days_until_due
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    on conflict (stripe_subscription_id)
    do update set status = excluded.status, price_id = excluded.price_id, trial_end = excluded.trial_end,
      current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end, canceled_at = excluded.canceled_at,
      collection_method = excluded.collection_method, days_until_due = excluded.days_until_due
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
      subscription.collection_method || null,
      subscription.days_until_due || null,
    ],
  );
  return result.rows[0];
}

async function ensureSubscriptionLicense(client, customer, subscription, email, companyName, machineId, licenseeAddress, licenseeCompanyNumber) {
  const existing = await client.query(`select * from licenses where stripe_subscription_id = $1 limit 1`, [subscription.id]);
  const status = stripeStatusToLicenseStatus(subscription.status);
  const previousTrialId = subscription.metadata?.previous_trial_license_id || '';
  const previousTrial = previousTrialId
    ? (await client.query(`select * from licenses where id = $1 and type = 'trial' limit 1`, [previousTrialId])).rows[0]
    : await findActiveTrialLicense({ machineId, email }, client);
  const previousTrialEnd = previousTrial?.trial_ends_at || subscription.metadata?.previous_trial_ends_at || null;

  if (existing.rows[0]) {
    await client.query(
      `update licenses
       set status = $1,
           current_period_end = $2,
           trial_ends_at = coalesce(trial_ends_at, $3),
           stripe_customer_id = $4,
           activated_machine_id = coalesce(activated_machine_id, $5),
           licensee_address = coalesce($6, licensee_address),
           licensee_company_number = coalesce($7, licensee_company_number)
       where id = $8`,
      [
        status,
        fromUnix(subscription.current_period_end),
        previousTrialEnd,
        subscription.customer,
        machineId || null,
        licenseeAddress || null,
        licenseeCompanyNumber || null,
        existing.rows[0].id,
      ],
    );
    return;
  }
  const duplicate = await findBillableSubscriptionLicense({ machineId, email, excludeSubscriptionId: subscription.id }, client);
  if (duplicate) {
    await client.query(
      `update licenses
       set note = trim(both from coalesce(note, '') || E'\n' || $1)
       where id = $2`,
      [`Duplicate Stripe subscription ignored: ${subscription.id}`, duplicate.id],
    );
    return;
  }
  const subscriptionLicense = await insertLicense({
    customer_id: customer?.id || null,
    type: 'subscription',
    status,
    plan: 'Professional',
    email,
    company_name: companyName,
    licensee_address: licenseeAddress,
    licensee_company_number: licenseeCompanyNumber,
    seats: 1,
    activated_machine_id: machineId || null,
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    trial_started_at: previousTrial?.trial_started_at || null,
    trial_ends_at: previousTrialEnd,
    current_period_end: fromUnix(subscription.current_period_end),
    created_by: 'stripe-webhook',
  }, client);

  if (previousTrial?.id) {
    await client.query(
      `update licenses
       set status = 'expired',
           note = trim(both from coalesce(note, '') || E'\n' || $1)
       where id = $2`,
      [`Converted to subscription ${subscription.id}; remaining trial moved to ${subscriptionLicense.license_key}.`, previousTrial.id],
    );
  }
}

async function handleSubscription(subscription, fallbackMetadata = {}) {
  const stripeCustomerId = String(subscription.customer || '');
  const customerObject = await getStripe().customers.retrieve(stripeCustomerId);
  const email = customerObject.email || subscription.metadata?.email || fallbackMetadata.email || null;
  const companyName = subscription.metadata?.licensee_name || subscription.metadata?.company_name || fallbackMetadata.company_name || customerObject.metadata?.company_name || null;
  const licenseeAddress = subscription.metadata?.licensee_address || fallbackMetadata.licensee_address || customerObject.metadata?.licensee_address || null;
  const licenseeCompanyNumber = subscription.metadata?.licensee_company_number || fallbackMetadata.licensee_company_number || customerObject.metadata?.licensee_company_number || null;
  const machineId = subscription.metadata?.machine_id || fallbackMetadata.machine_id || null;
  await withTransaction(async (client) => {
    const customer = await upsertCustomer(client, { email, companyName, stripeCustomerId, licenseeAddress, licenseeCompanyNumber });
    await upsertSubscription(client, customer, subscription);
    await ensureSubscriptionLicense(client, customer, subscription, email, companyName, machineId, licenseeAddress, licenseeCompanyNumber);
  });
}

async function handleCheckoutSession(session) {
  if (!session.subscription) return;
  const subscription = await getStripe().subscriptions.retrieve(session.subscription);
  await handleSubscription(subscription, {
    email: session.customer_email,
    company_name: session.metadata?.licensee_name || session.metadata?.company_name || '',
    licensee_address: session.metadata?.licensee_address || '',
    licensee_company_number: session.metadata?.licensee_company_number || '',
    machine_id: session.metadata?.machine_id || '',
  });
}

async function markLicenseBySubscription(subscriptionId, status, currentPeriodEnd = null) {
  await query(
    `update licenses set status = $1, current_period_end = coalesce($2, current_period_end) where stripe_subscription_id = $3`,
    [status, currentPeriodEnd, subscriptionId],
  );
}

async function handleInvoice(invoice) {
  const subscriptionId = stripeSubscriptionId(invoice.subscription);
  if (!subscriptionId) return;

  await query(
    `update subscriptions
     set latest_invoice_id = $1,
         latest_invoice_status = $2,
         latest_invoice_due_at = $3
     where stripe_subscription_id = $4`,
    [
      invoice.id || null,
      invoice.status || null,
      invoiceDueAt(invoice),
      subscriptionId,
    ],
  );

  const nextStatus = invoiceLicenseStatus(invoice);
  if (nextStatus) {
    await markLicenseBySubscription(
      subscriptionId,
      nextStatus,
      fromUnix(invoice.lines?.data?.[0]?.period?.end),
    );
  }
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
      case 'invoice.paid':
        if (object.subscription) {
          const subscriptionId = stripeSubscriptionId(object.subscription);
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          await handleSubscription(subscription);
          await handleInvoice(object);
          await markLicenseBySubscription(
            subscriptionId,
            'active',
            fromUnix(object.lines?.data?.[0]?.period?.end),
          );
        }
        break;
      case 'invoice.payment_failed':
        if (object.subscription) {
          const subscriptionId = stripeSubscriptionId(object.subscription);
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          await handleSubscription(subscription);
          await handleInvoice(object);
          await markLicenseBySubscription(subscriptionId, 'past_due');
        }
        break;
      case 'invoice.finalized':
      case 'invoice.sent':
      case 'invoice.updated':
      case 'invoice.marked_uncollectible':
      case 'invoice.voided':
        await handleInvoice(object);
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
