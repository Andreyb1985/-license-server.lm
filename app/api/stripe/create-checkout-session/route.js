import crypto from 'crypto';
import { json, readJson } from '../../../../lib/http.js';
import { getStripe } from '../../../../lib/stripe.js';
import { findActiveTrialLicense, findBillableSubscriptionLicense, publicLicenseResponse } from '../../../../lib/license.js';

function trialEndUnix(trialLicense) {
  if (!trialLicense?.trial_ends_at) return null;
  const value = Math.floor(new Date(trialLicense.trial_ends_at).getTime() / 1000);
  return Number.isFinite(value) && value > Math.floor(Date.now() / 1000) ? value : null;
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    const priceId = process.env.STRIPE_PRICE_ID;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!priceId) throw new Error('STRIPE_PRICE_ID is not configured.');
    if (!siteUrl) throw new Error('NEXT_PUBLIC_SITE_URL is not configured.');
    const email = String(body.email || '').trim();
    const companyName = String(body.company_name || '').trim();
    const machineId = String(body.machine_id || '').trim();

    const existingLicense = await findBillableSubscriptionLicense({ machineId, email });
    if (existingLicense) {
      return json({
        ok: true,
        already_active: true,
        message: 'Für diese Installation existiert bereits eine aktive Lizenz. Es wurde kein neuer Checkout erstellt.',
        license: publicLicenseResponse(existingLicense, 'License already active'),
      });
    }

    const existingTrial = await findActiveTrialLicense({ machineId, email });
    const preservedTrialEnd = trialEndUnix(existingTrial);
    const idempotencySource = machineId || email;
    const idempotencyKey = idempotencySource
      ? `lohnmail-checkout-${crypto.createHash('sha256').update(`${priceId}:${idempotencySource}`).digest('hex')}`
      : undefined;

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      allow_promotion_codes: true,
      success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cancel`,
      metadata: {
        app: 'lohnmail',
        company_name: companyName,
        machine_id: machineId,
        previous_trial_license_id: existingTrial?.id || '',
        previous_trial_ends_at: existingTrial?.trial_ends_at || '',
      },
      subscription_data: {
        ...(preservedTrialEnd ? { trial_end: preservedTrialEnd } : {}),
        metadata: {
          app: 'lohnmail',
          company_name: companyName,
          machine_id: machineId,
          email,
          previous_trial_license_id: existingTrial?.id || '',
          previous_trial_ends_at: existingTrial?.trial_ends_at || '',
        },
      },
    }, idempotencyKey ? { idempotencyKey } : undefined);

    return json({ ok: true, url: session.url, id: session.id });
  } catch (error) {
    return json({ ok: false, message: error.message }, 500);
  }
}
