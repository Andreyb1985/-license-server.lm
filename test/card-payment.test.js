import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeCardConversion,
  createCardSetupSession,
  isCardConversionSession,
} from '../lib/card-payment.js';

test('card choice creates a setup checkout for the existing subscription', async () => {
  let createParams;
  const stripe = {
    checkout: {
      sessions: {
        create: async (params) => {
          createParams = params;
          return { id: 'cs_setup', url: 'https://checkout.stripe.com/setup' };
        },
      },
    },
  };

  const session = await createCardSetupSession(stripe, {
    subscription: {
      id: 'sub_invoice',
      customer: 'cus_123',
    },
    siteUrl: 'https://license.example',
    license: {
      company_name: 'Example GmbH',
      email: 'office@example.test',
      activated_machine_id: 'machine-1',
    },
  });

  assert.equal(session.id, 'cs_setup');
  assert.equal(createParams.mode, 'setup');
  assert.equal(createParams.customer, 'cus_123');
  assert.equal(createParams.metadata.stripe_subscription_id, 'sub_invoice');
  assert.equal(createParams.metadata.billing_method, 'card');
  assert.match(createParams.success_url, /payment_method=card/);
});

test('completed setup pays the open invoice before switching future payments to card', async () => {
  const calls = [];
  const stripe = {
    setupIntents: {
      retrieve: async () => ({
        id: 'seti_123',
        status: 'succeeded',
        payment_method: 'pm_123',
      }),
    },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_invoice',
        customer: 'cus_123',
        collection_method: 'send_invoice',
        metadata: { app: 'lohnmail' },
        latest_invoice: {
          id: 'in_open',
          status: 'open',
          amount_remaining: 4000,
        },
      }),
      update: async (id, params) => {
        calls.push(['subscription.update', id, params]);
        return {
          id,
          customer: 'cus_123',
          status: 'active',
          collection_method: params.collection_method,
          metadata: params.metadata,
        };
      },
    },
    invoices: {
      pay: async (id, params) => {
        calls.push(['invoice.pay', id, params]);
        return { id, status: 'paid' };
      },
    },
  };
  const session = {
    mode: 'setup',
    customer: 'cus_123',
    setup_intent: 'seti_123',
    metadata: {
      action: 'convert_invoice_subscription_to_card',
      stripe_subscription_id: 'sub_invoice',
    },
  };

  assert.equal(isCardConversionSession(session), true);
  const result = await completeCardConversion(stripe, session);

  assert.equal(result.converted, true);
  assert.deepEqual(calls[0], ['invoice.pay', 'in_open', { payment_method: 'pm_123' }]);
  assert.equal(calls[1][0], 'subscription.update');
  assert.equal(calls[1][2].collection_method, 'charge_automatically');
  assert.equal(calls[1][2].default_payment_method, 'pm_123');
});

test('failed invoice payment does not switch the subscription to automatic collection', async () => {
  let subscriptionUpdated = false;
  const stripe = {
    setupIntents: {
      retrieve: async () => ({
        status: 'succeeded',
        payment_method: 'pm_declined',
      }),
    },
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_invoice',
        customer: 'cus_123',
        collection_method: 'send_invoice',
        latest_invoice: {
          id: 'in_open',
          status: 'open',
          amount_remaining: 4000,
        },
      }),
      update: async () => {
        subscriptionUpdated = true;
      },
    },
    invoices: {
      pay: async () => {
        throw new Error('card declined');
      },
    },
  };

  const result = await completeCardConversion(stripe, {
    mode: 'setup',
    customer: 'cus_123',
    setup_intent: 'seti_declined',
    metadata: {
      action: 'convert_invoice_subscription_to_card',
      stripe_subscription_id: 'sub_invoice',
    },
  });

  assert.equal(result.converted, false);
  assert.equal(subscriptionUpdated, false);
  assert.match(result.message, /card declined/);
});
