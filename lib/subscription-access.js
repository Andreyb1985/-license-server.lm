import { invoiceDueAt, invoiceLicenseStatus } from './invoice.js';
import { stripeStatusToLicenseStatus } from './license.js';

function fromUnix(value) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function retrieveLatestInvoice(stripe, subscription) {
  const value = subscription?.latest_invoice;
  if (!value) return null;
  if (typeof value !== 'string') return value;
  return stripe.invoices.retrieve(value);
}

async function hasPaidInvoice(stripe, subscriptionId, latestInvoice) {
  if (String(latestInvoice?.status || '').toLowerCase() === 'paid') return true;
  const paid = await stripe.invoices.list({
    subscription: subscriptionId,
    status: 'paid',
    limit: 1,
  });
  return paid.data.length > 0;
}

export function resolveSubscriptionLicenseStatus(
  subscription,
  {
    latestInvoice = null,
    hasPaidSubscriptionInvoice = false,
    currentLicenseStatus = '',
    nowMs = Date.now(),
  } = {},
) {
  const currentStatus = String(currentLicenseStatus || '').toLowerCase();
  if (currentStatus === 'revoked') return 'revoked';

  const stripeStatus = String(subscription?.status || '').toLowerCase();
  const mappedStatus = stripeStatusToLicenseStatus(stripeStatus);
  if (subscription?.collection_method !== 'send_invoice') {
    return mappedStatus;
  }

  if (stripeStatus === 'trialing') {
    const trialEndMs = Number(subscription?.trial_end || 0) * 1000;
    return trialEndMs > nowMs ? 'trialing' : 'unpaid';
  }

  if (['past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused'].includes(stripeStatus)) {
    return mappedStatus;
  }

  const invoiceStatus = latestInvoice
    ? invoiceLicenseStatus(latestInvoice, nowMs, { hasPaidSubscriptionInvoice })
    : null;
  if (invoiceStatus) return invoiceStatus;

  if (hasPaidSubscriptionInvoice) {
    return mappedStatus === 'active' ? 'active' : mappedStatus;
  }

  return 'unpaid';
}

export async function inspectStripeSubscription(
  stripe,
  subscriptionOrId,
  { currentLicenseStatus = '', nowMs = Date.now() } = {},
) {
  const subscription =
    typeof subscriptionOrId === 'string'
      ? await stripe.subscriptions.retrieve(subscriptionOrId, {
          expand: ['latest_invoice'],
        })
      : subscriptionOrId;
  const latestInvoice =
    subscription?.collection_method === 'send_invoice'
      ? await retrieveLatestInvoice(stripe, subscription)
      : null;
  const paidInvoice =
    subscription?.collection_method === 'send_invoice'
      ? await hasPaidInvoice(stripe, subscription.id, latestInvoice)
      : false;
  const licenseStatus = resolveSubscriptionLicenseStatus(subscription, {
    latestInvoice,
    hasPaidSubscriptionInvoice: paidInvoice,
    currentLicenseStatus,
    nowMs,
  });

  return {
    subscription,
    latestInvoice,
    hasPaidSubscriptionInvoice: paidInvoice,
    licenseStatus,
    currentPeriodEnd: fromUnix(subscription?.current_period_end),
    latestInvoiceId: latestInvoice?.id || null,
    latestInvoiceStatus: latestInvoice?.status || null,
    latestInvoiceDueAt: invoiceDueAt(latestInvoice),
  };
}
