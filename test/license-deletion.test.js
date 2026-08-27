import assert from 'node:assert/strict';
import test from 'node:test';

import { requireStripeDeleteConfirmation } from '../lib/license-deletion.js';

test('manual licenses do not require Stripe confirmation', () => {
  assert.doesNotThrow(() => requireStripeDeleteConfirmation({ license_key: 'LM-DEMO-1' }, ''));
});

test('Stripe licenses require an explicit additional confirmation', () => {
  const license = { stripe_subscription_id: 'sub_live' };
  assert.throws(
    () => requireStripeDeleteConfirmation(license, false),
    /Additional confirmation/,
  );
  assert.doesNotThrow(() => requireStripeDeleteConfirmation(license, true));
});
