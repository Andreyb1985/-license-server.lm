import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invoiceDueAt,
  invoiceLicenseStatus,
  stripeSubscriptionId,
} from '../lib/invoice.js';

test('paid invoices activate the license', () => {
  assert.equal(invoiceLicenseStatus({ status: 'paid' }), 'active');
});

test('open overdue invoices become past due', () => {
  assert.equal(
    invoiceLicenseStatus({ status: 'open', due_date: 1_700_000_000 }, 1_700_000_001_000),
    'past_due',
  );
});

test('open invoices before their due date do not change the license', () => {
  assert.equal(
    invoiceLicenseStatus({ status: 'open', due_date: 1_700_000_000 }, 1_699_999_999_000),
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
