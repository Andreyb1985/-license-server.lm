import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invoiceDueAt,
  invoiceLicenseStatus,
  stripeSubscriptionId,
} from '../lib/invoice.js';
import {
  inspectStripeSubscription,
  resolveSubscriptionLicenseStatus,
} from '../lib/subscription-access.js';

test('paid invoices activate the license', () => {
  assert.equal(invoiceLicenseStatus({ status: 'paid' }), 'active');
});

test('open overdue invoices become past due', () => {
  assert.equal(
    invoiceLicenseStatus({ status: 'open', due_date: 1_700_000_000 }, 1_700_000_001_000),
    'past_due',
  );
});

test('the first open invoice blocks access until it is paid', () => {
  assert.equal(
    invoiceLicenseStatus({ status: 'open', due_date: 1_700_000_000 }, 1_699_999_999_000),
    'unpaid',
  );
});

test('an open renewal invoice preserves access from an earlier paid invoice', () => {
  assert.equal(
    invoiceLicenseStatus(
      { status: 'open', due_date: 1_700_000_000 },
      1_699_999_999_000,
      { hasPaidSubscriptionInvoice: true },
    ),
    null,
  );
});

test('uncollectible and void invoices block the license', () => {
  assert.equal(invoiceLicenseStatus({ status: 'uncollectible' }), 'unpaid');
  assert.equal(invoiceLicenseStatus({ status: 'void' }), 'canceled');
});

test('invoice helpers normalize subscription and due date values', () => {
  assert.equal(stripeSubscriptionId('sub_123'), 'sub_123');
  assert.equal(stripeSubscriptionId({ id: 'sub_456' }), 'sub_456');
  assert.equal(invoiceDueAt({ due_date: 1_700_000_000 }), '2023-11-14T22:13:20.000Z');
});

test('send-invoice subscriptions require a paid invoice before becoming active', () => {
  const subscription = {
    status: 'active',
    collection_method: 'send_invoice',
  };
  assert.equal(
    resolveSubscriptionLicenseStatus(subscription, {
      latestInvoice: { status: 'open', due_date: 1_700_000_000 },
      nowMs: 1_699_999_999_000,
    }),
    'unpaid',
  );
  assert.equal(
    resolveSubscriptionLicenseStatus(subscription, {
      latestInvoice: { status: 'paid' },
      hasPaidSubscriptionInvoice: true,
    }),
    'active',
  );
});

test('a preserved trial remains usable while its first invoice is pending', () => {
  assert.equal(
    resolveSubscriptionLicenseStatus(
      {
        status: 'trialing',
        collection_method: 'send_invoice',
        trial_end: 1_700_000_000,
      },
      { nowMs: 1_699_999_999_000 },
    ),
    'trialing',
  );
});

test('a paid prepaid month activates a Stripe subscription that is still trialing', () => {
  assert.equal(
    resolveSubscriptionLicenseStatus({
      status: 'trialing',
      collection_method: 'send_invoice',
      trial_end: 1_800_000_000,
      metadata: { lohnmail_prepaid_trial_paid: 'true' },
    }),
    'active',
  );
});

test('revoked licenses cannot be reactivated by Stripe subscription events', () => {
  assert.equal(
    resolveSubscriptionLicenseStatus(
      { status: 'active', collection_method: 'send_invoice' },
      {
        latestInvoice: { status: 'paid' },
        hasPaidSubscriptionInvoice: true,
        currentLicenseStatus: 'revoked',
      },
    ),
    'revoked',
  );
});

test('Stripe inspection treats an active invoice subscription without payments as unpaid', async () => {
  const stripe = {
    subscriptions: {
      retrieve: async () => ({
        id: 'sub_unpaid',
        status: 'active',
        collection_method: 'send_invoice',
        current_period_end: 1_700_000_000,
        latest_invoice: {
          id: 'in_open',
          status: 'open',
          due_date: 1_700_000_000,
        },
      }),
    },
    invoices: {
      list: async () => ({ data: [] }),
    },
  };
  const state = await inspectStripeSubscription(stripe, 'sub_unpaid', {
    nowMs: 1_699_999_999_000,
  });
  assert.equal(state.licenseStatus, 'unpaid');
  assert.equal(state.latestInvoiceStatus, 'open');
});
