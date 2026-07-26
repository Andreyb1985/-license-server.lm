import crypto from 'crypto';
import { json, readJson } from '../../../../lib/http.js';
import { getStripe } from '../../../../lib/stripe.js';
import { findActiveTrialLicense, findBillableSubscriptionLicense, publicLicenseResponse } from '../../../../lib/license.js';

const INVOICE_PAYMENT_METHODS = ['card', 'customer_balance'];

function trialEndUnix(trialLicense) {
  if (!trialLicense?.trial_ends_at) return null;
  const value = Math.floor(new Date(trialLicense.trial_ends_at).getTime() / 1000);
  return Number.isFinite(value) && value > Math.floor(Date.now() / 1000) ? value : null;
}

async function openExistingInvoiceForCardPayment(stripe, license) {
  const subscriptionId = String(license?.stripe_subscription_id || '').trim();
  if (!subscriptionId) return null;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  });
  if (subscription.collection_method !== 'send_invoice') return null;

  await stripe.subscriptions.update(subscription.id, {
    payment_settings: {
      payment_method_types: INVOICE_PAYMENT_METHODS,
    },
  });

  const latestInvoice =
    subscription.latest_invoice && typeof subscription.latest_invoice !== 'string'
      ? subscription.latest_invoice
      : null;
  if (!latestInvoice || latestInvoice.status !== 'open') return null;

  const invoice = await stripe.invoices.update(latestInvoice.id, {
    payment_settings: {
      payment_method_types: INVOICE_PAYMENT_METHODS,
    },
  });
  if (!invoice.hosted_invoice_url) return null;

  return {
    ok: true,
    existing_invoice: true,
    billing_method: 'invoice',
    url: invoice.hosted_invoice_url,
    invoice_id: invoice.id,
    message: 'Die offene Rechnung wurde zur Kartenzahlung geöffnet.',
    license: publicLicenseResponse(license, 'Open invoice ready for card payment'),
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
    const existingLicense = await findBillableSubscriptionLicense({ machineId, email });
    if (existingLicense) {
      const existingInvoice = await openExistingInvoiceForCardPayment(stripe, existingLicense);
      if (existingInvoice) {
        return json(existingInvoice);
      }
      return json({
        ok: true,
        already_active: true,
        message: 'Für diese Installation existiert bereits eine aktive Lizenz. Es wurde kein neuer Checkout erstellt.',
        license: publicLicenseResponse(existingLicense, 'License already active'),
      });
    }

    const existingTrial = await findActiveTrialLicense({ machineId, email });
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
