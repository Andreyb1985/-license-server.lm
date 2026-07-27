import crypto from 'crypto';

export const PREPAID_TRIAL_FLAG = 'lohnmail_prepaid_trial_month';
export const PREPAID_TRIAL_END = 'lohnmail_original_trial_end';
export const PREPAID_ACCESS_END = 'lohnmail_prepaid_access_end';
export const PREPAID_TRIAL_PAID = 'lohnmail_prepaid_trial_paid';

function objectId(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : String(value.id || '');
}

function unixFromDate(value) {
  if (!value) return null;
  const unix = Math.floor(new Date(value).getTime() / 1000);
  return Number.isFinite(unix) ? unix : null;
}

export function activeTrialEndUnix(license, nowUnix = Math.floor(Date.now() / 1000)) {
  const unix = unixFromDate(license?.trial_ends_at || license?.related_trial_ends_at);
  return unix && unix > nowUnix ? unix : null;
}

export function addCalendarMonthsUnix(unix, months = 1) {
  const source = new Date(Number(unix) * 1000);
  if (!Number.isFinite(source.getTime())) return null;
  const day = source.getUTCDate();
  const result = new Date(source);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return Math.floor(result.getTime() / 1000);
}

export function prepaidTrialPlan(license, nowUnix = Math.floor(Date.now() / 1000)) {
  const trialEnd = activeTrialEndUnix(license, nowUnix);
  if (!trialEnd) return null;
  return {
    trialEnd,
    accessEnd: addCalendarMonthsUnix(trialEnd, 1),
  };
}

export function oneTimePriceData(price) {
  const product = objectId(price?.product);
  const currency = String(price?.currency || '').trim();
  if (!product || !currency) {
    throw new Error('Der Stripe-Preis enthält kein Produkt oder keine Währung.');
  }

  const data = { currency, product };
  if (price.unit_amount !== null && price.unit_amount !== undefined) {
    data.unit_amount = price.unit_amount;
  } else if (price.unit_amount_decimal) {
    data.unit_amount_decimal = price.unit_amount_decimal;
  } else {
    throw new Error('Der Stripe-Preis enthält keinen abrechenbaren Betrag.');
  }
  return data;
}

export function prepaidMetadata(plan, metadata = {}) {
  if (!plan) return metadata;
  return {
    ...metadata,
    [PREPAID_TRIAL_FLAG]: 'true',
    [PREPAID_TRIAL_END]: String(plan.trialEnd),
    [PREPAID_ACCESS_END]: String(plan.accessEnd),
    [PREPAID_TRIAL_PAID]: '',
  };
}

function invoiceHasPrepaidFlag(invoice) {
  return invoice?.metadata?.[PREPAID_TRIAL_FLAG] === 'true';
}

function invoiceHasAmount(invoice) {
  return Number(invoice?.amount_remaining ?? invoice?.amount_due ?? 0) > 0;
}

async function findExistingPrepaidInvoice(stripe, subscriptionId) {
  const invoices = await stripe.invoices.list({
    subscription: subscriptionId,
    limit: 20,
  });
  return (
    invoices.data.find(
      (invoice) =>
        invoiceHasPrepaidFlag(invoice)
        && ['draft', 'open', 'paid'].includes(String(invoice.status || '')),
    )
    || invoices.data.find(
      (invoice) =>
        ['draft', 'open'].includes(String(invoice.status || ''))
        && invoiceHasAmount(invoice),
    )
    || null
  );
}

function stableKey(prefix, subscriptionId, accessEnd) {
  const hash = crypto
    .createHash('sha256')
    .update(`${subscriptionId}:${accessEnd}`)
    .digest('hex');
  return `${prefix}-${hash}`;
}

export async function ensurePrepaidTrialInvoice(
  stripe,
  {
    subscription,
    trialLicense,
    priceId,
    paymentMethodTypes,
    billingMethod,
    daysUntilDue = 14,
    convertToCard = false,
    cardConversionFlag = '',
  },
) {
  const subscriptionId = objectId(subscription);
  const customerId = objectId(subscription?.customer);
  const plan = prepaidTrialPlan(trialLicense);
  if (!subscriptionId || !customerId || !plan) return null;

  let invoice = await findExistingPrepaidInvoice(stripe, subscriptionId);
  const metadata = prepaidMetadata(plan, {
    ...subscription.metadata,
    billing_method: billingMethod,
    ...(cardConversionFlag
      ? { [cardConversionFlag]: convertToCard ? 'true' : '' }
      : {}),
  });

  await stripe.subscriptions.update(subscriptionId, {
    payment_settings: {
      payment_method_types: paymentMethodTypes,
      ...(convertToCard ? { save_default_payment_method: 'on_subscription' } : {}),
    },
    metadata,
  });

  if (!invoice) {
    const price = await stripe.prices.retrieve(priceId);
    const priceData = oneTimePriceData(price);
    await stripe.invoiceItems.create(
      {
        customer: customerId,
        subscription: subscriptionId,
        price_data: priceData,
        quantity: 1,
        description: 'LohnMail Professional - vorausbezahlter Monat nach der Probezeit',
        metadata: {
          [PREPAID_TRIAL_FLAG]: 'true',
          [PREPAID_ACCESS_END]: String(plan.accessEnd),
        },
      },
      {
        idempotencyKey: stableKey(
          'lohnmail-prepaid-item-v2',
          subscriptionId,
          plan.accessEnd,
        ),
      },
    );

    invoice = await stripe.invoices.create(
      {
        customer: customerId,
        subscription: subscriptionId,
        collection_method: 'send_invoice',
        days_until_due: daysUntilDue,
        auto_advance: false,
        payment_settings: {
          payment_method_types: paymentMethodTypes,
        },
        metadata: {
          [PREPAID_TRIAL_FLAG]: 'true',
          [PREPAID_TRIAL_END]: String(plan.trialEnd),
          [PREPAID_ACCESS_END]: String(plan.accessEnd),
        },
      },
      {
        idempotencyKey: stableKey(
          'lohnmail-prepaid-invoice-v2',
          subscriptionId,
          plan.accessEnd,
        ),
      },
    );
  }

  if (invoice.status === 'draft') {
    invoice = await stripe.invoices.update(invoice.id, {
      payment_settings: {
        payment_method_types: paymentMethodTypes,
      },
    });
    invoice = await stripe.invoices.finalizeInvoice(invoice.id);
  } else if (invoice.status === 'open') {
    invoice = await stripe.invoices.update(invoice.id, {
      payment_settings: {
        payment_method_types: paymentMethodTypes,
      },
    });
  }

  if (invoice.status !== 'paid' && !invoice.hosted_invoice_url) {
    throw new Error('Stripe hat keine Zahlungsseite für den vorausbezahlten Monat geliefert.');
  }

  return { invoice, plan };
}

export async function completePrepaidTrialPayment(stripe, subscription, invoice) {
  if (String(invoice?.status || '').toLowerCase() !== 'paid') {
    return { handled: false, subscription };
  }
  const metadata = subscription?.metadata || {};
  const invoiceMetadata = invoice?.metadata || {};
  const accessEnd = Number(
    metadata[PREPAID_ACCESS_END] || invoiceMetadata[PREPAID_ACCESS_END] || 0,
  );
  const isPrepaid =
    metadata[PREPAID_TRIAL_FLAG] === 'true'
    || invoiceMetadata[PREPAID_TRIAL_FLAG] === 'true';
  if (!isPrepaid || !Number.isFinite(accessEnd) || accessEnd <= 0) {
    return { handled: false, subscription };
  }
  if (metadata[PREPAID_TRIAL_PAID] === 'true') {
    return { handled: true, subscription };
  }

  const currentTrialEnd = Number(subscription?.trial_end || 0);
  const updated = await stripe.subscriptions.update(subscription.id, {
    ...(accessEnd > currentTrialEnd ? { trial_end: accessEnd } : {}),
    metadata: {
      ...metadata,
      [PREPAID_TRIAL_FLAG]: 'true',
      [PREPAID_ACCESS_END]: String(accessEnd),
      [PREPAID_TRIAL_PAID]: 'true',
    },
  });
  return { handled: true, subscription: updated };
}
