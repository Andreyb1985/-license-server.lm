import crypto from 'crypto';
import { json, readJson } from '../../../../lib/http.js';
import { getStripe } from '../../../../lib/stripe.js';
import {
  findActiveTrialLicense,
  findBillableSubscriptionLicense,
  licenseForPaymentResponse,
  publicLicenseResponse,
} from '../../../../lib/license.js';
import { createCardSetupSession } from '../../../../lib/card-payment.js';

function trialEndUnix(trialLicense) {
  if (!trialLicense?.trial_ends_at) return null;
  const value = Math.floor(new Date(trialLicense.trial_ends_at).getTime() / 1000);
  return Number.isFinite(value) && value > Math.floor(Date.now() / 1000) ? value : null;
}

async function createExistingSubscriptionCardSetup(stripe, license, responseLicense, siteUrl) {
  const subscriptionId = String(license?.stripe_subscription_id || '').trim();
  if (!subscriptionId) return null;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  });
  if (subscription.collection_method !== 'send_invoice') {
    return {
      ok: true,
      already_active: true,
      message: 'Für diese Installation ist die automatische Kartenzahlung bereits eingerichtet.',
      license: publicLicenseResponse(responseLicense, 'Card subscription already active'),
    };
  }

  const session = await createCardSetupSession(stripe, {
    subscription,
    siteUrl,
    license,
  });

  return {
    ok: true,
    billing_method: 'card',
    converting_payment_method: true,
    url: session.url,
    id: session.id,
    message: 'Stripe wurde geöffnet, um die Karte für automatische Zahlungen zu bestätigen.',
    license: publicLicenseResponse(responseLicense, 'Card setup started'),
  };
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    const priceId = process.env.STRIPE_PRICE_ID;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!priceId) throw new Error('STRIPE_PRICE_ID is not configured.');
    if (!siteUrl) throw new Error('NEXT_PUBLIC_SITE_URL is not configured.');
    const email = String(body.licensee_email || body.email || '').trim();
    const companyName = String(body.licensee_name || body.company_name || '').trim();
    const licenseeAddress = String(body.licensee_address || '').trim();
    const licenseeCompanyNumber = String(body.licensee_company_number || '').trim();
    const machineId = String(body.machine_id || '').trim();

    const stripe = getStripe();
    const existingTrial = await findActiveTrialLicense({ machineId, email });
    const existingLicense = await findBillableSubscriptionLicense({ machineId, email });
    if (existingLicense) {
      const responseLicense = licenseForPaymentResponse(existingLicense, existingTrial);
      const cardSetup = await createExistingSubscriptionCardSetup(
        stripe,
        existingLicense,
        responseLicense,
        siteUrl,
      );
      if (cardSetup) {
        return json(cardSetup);
      }
      return json({
        ok: true,
        already_active: true,
        message: 'Für diese Installation existiert bereits eine aktive Lizenz. Es wurde kein neuer Checkout erstellt.',
        license: publicLicenseResponse(responseLicense, 'License already active'),
      });
    }

    const preservedTrialEnd = trialEndUnix(existingTrial);
    const idempotencySource = [machineId, email, companyName, licenseeAddress, licenseeCompanyNumber].join(':');
    const idempotencyKey = idempotencySource
      ? `lohnmail-checkout-${crypto.createHash('sha256').update(`${priceId}:${idempotencySource}`).digest('hex')}`
      : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      allow_promotion_codes: true,
      success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cancel`,
      metadata: {
        app: 'lohnmail',
        company_name: companyName,
        licensee_name: companyName,
        licensee_email: email,
        licensee_address: licenseeAddress,
        licensee_company_number: licenseeCompanyNumber,
        machine_id: machineId,
        billing_method: 'card',
        previous_trial_license_id: existingTrial?.id || '',
        previous_trial_ends_at: existingTrial?.trial_ends_at || '',
      },
      subscription_data: {
        ...(preservedTrialEnd ? { trial_end: preservedTrialEnd } : {}),
        metadata: {
          app: 'lohnmail',
          company_name: companyName,
          licensee_name: companyName,
          licensee_email: email,
          licensee_address: licenseeAddress,
          licensee_company_number: licenseeCompanyNumber,
          machine_id: machineId,
          email,
          billing_method: 'card',
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
