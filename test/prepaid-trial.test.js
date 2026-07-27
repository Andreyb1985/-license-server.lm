import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PREPAID_ACCESS_END,
  PREPAID_TRIAL_FLAG,
  PREPAID_TRIAL_PAID,
  addCalendarMonthsUnix,
  completePrepaidTrialPayment,
  ensurePrepaidTrialInvoice,
  oneTimePriceData,
  prepaidTrialPlan,
} from '../lib/prepaid-trial.js';

test('the prepaid month starts after the preserved trial', () => {
  const trialEnd = Math.floor(Date.parse('2028-01-31T12:00:00.000Z') / 1000);
  const accessEnd = addCalendarMonthsUnix(trialEnd, 1);

  assert.equal(
    new Date(accessEnd * 1000).toISOString(),
    '2028-02-29T12:00:00.000Z',
  );
});

test('the recurring Stripe price becomes a one-time price with the same amount', () => {
  assert.deepEqual(
    oneTimePriceData({
      currency: 'eur',
      unit_amount: 4000,
      product: 'prod_lohnmail',
    }),
    {
      currency: 'eur',
      unit_amount: 4000,
      product: 'prod_lohnmail',
    },
  );
});

test('an existing zero-value trial subscription gets a real open invoice', async () => {
  const calls = [];
  const trialEnd = new Date(Date.now() + 30 * 86400000).toISOString();
  const stripe = {
    invoices: {
      list: async () => ({ data: [] }),
      create: async (params) => {
        calls.push(['invoice.create', params]);
        return { id: 'in_prepaid', status: 'draft', metadata: params.metadata };
      },
      update: async (id, params) => {
        calls.push(['invoice.update', id, params]);
        return { id, status: 'draft' };
      },
      finalizeInvoice: async (id) => ({
        id,
        status: 'open',
        amount_due: 4000,
        amount_remaining: 4000,
        hosted_invoice_url: 'https://invoice.stripe.test/prepaid',
      }),
    },
    invoiceItems: {
      create: async (params) => {
        calls.push(['invoiceItem.create', params]);
        return { id: 'ii_prepaid' };
      },
    },
    prices: {
      retrieve: async () => ({
        currency: 'eur',
        unit_amount: 4000,
        product: 'prod_lohnmail',
      }),
    },
    subscriptions: {
      update: async (id, params) => {
        calls.push(['subscription.update', id, params]);
        return { id, ...params };
      },
    },
  };

  const result = await ensurePrepaidTrialInvoice(stripe, {
    subscription: {
      id: 'sub_zero',
      customer: 'cus_123',
      metadata: { app: 'lohnmail' },
    },
    trialLicense: { trial_ends_at: trialEnd },
    priceId: 'price_monthly',
    paymentMethodTypes: ['card'],
    billingMethod: 'card_pending',
    convertToCard: true,
    cardConversionFlag: 'convert_to_card_after_invoice_payment',
  });

  assert.equal(result.invoice.amount_due, 4000);
  assert.equal(
    result.invoice.hosted_invoice_url,
    'https://invoice.stripe.test/prepaid',
  );
  assert.equal(calls[1][1].price_data.unit_amount, 4000);
  assert.equal(calls[2][1].metadata[PREPAID_TRIAL_FLAG], 'true');
});

test('paid prepaid invoice extends Stripe trial and records payment', async () => {
  const trialEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  const plan = prepaidTrialPlan({
    trial_ends_at: new Date(trialEnd * 1000).toISOString(),
  });
  let updateParams;
  const stripe = {
    subscriptions: {
      update: async (id, params) => {
        updateParams = params;
        return { id, trial_end: params.trial_end, metadata: params.metadata };
      },
    },
  };
  const subscription = {
    id: 'sub_prepaid',
    trial_end: plan.trialEnd,
    metadata: {
      [PREPAID_TRIAL_FLAG]: 'true',
      [PREPAID_ACCESS_END]: String(plan.accessEnd),
    },
  };

  const result = await completePrepaidTrialPayment(stripe, subscription, {
    status: 'paid',
  });

  assert.equal(result.handled, true);
  assert.equal(updateParams.trial_end, plan.accessEnd);
  assert.equal(updateParams.metadata[PREPAID_TRIAL_PAID], 'true');
});
