import crypto from 'crypto';
import { json, readJson } from '../../../../lib/http.js';
import { getStripe } from '../../../../lib/stripe.js';
import {
  findActiveTrialLicense,
  findBillableSubscriptionLicense,
  licenseForPaymentResponse,
  publicLicenseResponse,
} from '../../../../lib/license.js';
import {
  createCardSetupSession,
  prepareOpenInvoiceCardPayment,
} from '../../../../lib/card-payment.js';
import {
  ensurePrepaidTrialInvoice,
  oneTimePriceData,
  prepaidMetadata,
  prepaidTrialPlan,
} from '../../../../lib/prepaid-trial.js';

async function createExistingSubscriptionCardSetup(
  stripe,
  license,
  responseLicense,
  trialLicense,
  siteUrl,
  priceId,
) {
  const subscriptionId = String(license?.stripe_subscription_id || '').trim();
  if (!subscriptionId) return null;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  });
  const prepaidInvoice = await ensurePrepaidTrialInvoice(stripe, {
    subscription,
    trialLicense,
    priceId,
    paymentMethodTypes: ['card'],
    billingMethod: 'card_pending',
    convertToCard: true,
    cardConversionFlag: 'convert_to_card_after_invoice_payment',
  });
  if (prepaidInvoice?.invoice?.status !== 'paid') {
    return {
      ok: true,
      billing_method: 'card',
      existing_invoice: true,
      converting_payment_method: true,
      invoice_url: prepaidInvoice.invoice.hosted_invoice_url,
      url: prepaidInvoice.invoice.hosted_invoice_url,
      id: prepaidInvoice.invoice.id,
      message: 'Der vorausbezahlte Monat wurde zur Kartenzahlung geöffnet.',
      license: publicLicenseResponse(responseLicense, 'Prepaid month ready for card payment'),
    };
  }
  if (subscription.collection_method !== 'send_invoice') {
    return {
      ok: true,
      already_active: true,
      message: 'Für diese Installation ist die automatische Kartenzahlung bereits eingerichtet.',
      license: publicLicenseResponse(responseLicense, 'Card subscription already active'),
    };
  }

  const invoicePayment = await prepareOpenInvoiceCardPayment(stripe, subscription);
  if (invoicePayment) {
    return {
      ok: true,
      billing_method: 'card',
      existing_invoice: true,
      converting_payment_method: true,
      invoice_url: invoicePayment.url,
      url: invoicePayment.url,
      id: invoicePayment.invoice.id,
      message:
        'Die offene Rechnung wurde zur Kartenzahlung geöffnet. Nach erfolgreicher Zahlung werden Folgerechnungen automatisch eingezogen.',
      license: publicLicenseResponse(responseLicense, 'Open invoice ready for card payment'),
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
    message:
      'Aktuell ist keine Rechnung fällig. Stripe wurde geöffnet, um die Karte für zukünftige Zahlungen zu bestätigen.',
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
        existingTrial || existingLicense,
        siteUrl,
        priceId,
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

    const prepaidPlan = prepaidTrialPlan(existingTrial);
    const lineItems = [{ price: priceId, quantity: 1 }];
    if (prepaidPlan) {
      const recurringPrice = await stripe.prices.retrieve(priceId);
      lineItems.push({
        price_data: oneTimePriceData(recurringPrice),
        quantity: 1,
      });
    }
    const idempotencySource = [machineId, email, companyName, licenseeAddress, licenseeCompanyNumber].join(':');
    const idempotencyKey = idempotencySource
      ? `lohnmail-checkout-v2-${crypto.createHash('sha256').update(`${priceId}:${idempotencySource}`).digest('hex')}`
      : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: lineItems,
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
        ...(prepaidPlan ? { trial_end: prepaidPlan.accessEnd } : {}),
        metadata: prepaidMetadata(prepaidPlan, {
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
        }),
      },
    }, idempotencyKey ? { idempotencyKey } : undefined);

    return json({ ok: true, url: session.url, id: session.id });
  } catch (error) {
    return json({ ok: false, message: error.message }, 500);
  }
}
