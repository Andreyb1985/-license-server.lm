import assert from 'node:assert/strict';
import test from 'node:test';
import {
  licenseAccessEndsAt,
  licenseForPaymentResponse,
  publicLicenseResponse,
} from '../lib/license.js';

function futureIso(days = 30) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

test('an unpaid subscription does not replace an active standalone trial during payment', () => {
  const unpaidSubscription = {
    id: 'subscription-license',
    type: 'subscription',
    status: 'unpaid',
  };
  const activeTrial = {
    id: 'trial-license',
    type: 'trial',
    status: 'trialing',
    trial_ends_at: futureIso(),
  };

  assert.equal(
    licenseForPaymentResponse(unpaidSubscription, activeTrial),
    activeTrial,
  );
});

test('an active subscription remains the preferred payment response', () => {
  const activeSubscription = {
    id: 'subscription-license',
    type: 'subscription',
    status: 'active',
  };
  const activeTrial = {
    id: 'trial-license',
    type: 'trial',
    status: 'trialing',
    trial_ends_at: futureIso(),
  };

  assert.equal(
    licenseForPaymentResponse(activeSubscription, activeTrial),
    activeSubscription,
  );
});

test('a preserved trial keeps an unpaid subscription usable until the trial ends', () => {
  const response = publicLicenseResponse({
    license_key: 'LM-PRO-TEST-TEST-0001',
    type: 'subscription',
    status: 'unpaid',
    plan: 'Professional',
    trial_ends_at: futureIso(),
    current_period_end: null,
  });

  assert.equal(response.status, 'trialing');
  assert.equal(response.active, true);
  assert.equal(response.blocked, false);
  assert.ok(response.days_remaining > 0);
});

test('an unpaid subscription is blocked when its preserved trial has ended', () => {
  const response = publicLicenseResponse({
    license_key: 'LM-PRO-TEST-TEST-0002',
    type: 'subscription',
    status: 'unpaid',
    plan: 'Professional',
    trial_ends_at: '2020-01-01T00:00:00.000Z',
    current_period_end: null,
  });

  assert.equal(response.status, 'unpaid');
  assert.equal(response.active, false);
  assert.equal(response.blocked, true);
});

test('creating a subscription does not add a paid month before payment', () => {
  const trialEnd = futureIso(30);
  const accessEnd = licenseAccessEndsAt({
    type: 'subscription',
    status: 'trialing',
    stripe_subscription_id: 'sub_pending',
    trial_ends_at: trialEnd,
    current_period_end: trialEnd,
  });

  assert.equal(accessEnd, trialEnd);
});

test('a paid subscription adds one calendar month after its preserved trial', () => {
  const trialEnd = '2028-01-31T12:00:00.000Z';
  const accessEnd = licenseAccessEndsAt({
    type: 'subscription',
    status: 'active',
    stripe_subscription_id: 'sub_paid',
    trial_ends_at: trialEnd,
    current_period_end: trialEnd,
  });

  assert.equal(accessEnd, '2028-02-29T12:00:00.000Z');
});
