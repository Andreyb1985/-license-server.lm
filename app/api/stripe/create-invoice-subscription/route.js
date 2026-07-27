import crypto from 'crypto';
import { json, readJson } from '../../../../lib/http.js';
import { getStripe } from '../../../../lib/stripe.js';
import {
  findActiveTrialLicense,
  findBillableSubscriptionLicense,
  licenseForPaymentResponse,
  publicLicenseResponse,
} from '../../../../lib/license.js';
import { CARD_INVOICE_CONVERSION_FLAG } from '../../../../lib/card-payment.js';
import {
  ensurePrepaidTrialInvoice,
  oneTimePriceData,
  prepaidMetadata,
  prepaidTrialPlan,
} from '../../../../lib/prepaid-trial.js';

const INVOICE_DAYS_UNTIL_DUE = 14;
const INVOICE_PAYMENT_METHODS = ['card', 'customer_balance'];

function requiredText(value, field, maxLength) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) throw new Error(`${field} is required.`);
  if (text.length > maxLength) throw new Error(`${field} is too long.`);
  return text;
}

function optionalText(value, maxLength) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (text.length > maxLength) throw new Error('Value is too long.');
  return text;
}

function validEmail(value) {
  const email = requiredText(value, 'email', 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('email is invalid.');
  }
  return email;
}

async function findOrCreateCustomer(stripe, { email, companyName, address, companyNumber }) {
  const existing = await stripe.customers.list({ email, limit: 1 });
  const customer = existing.data[0];
  const metadata = {
    app: 'lohnmail',
    company_name: companyName,
    licensee_address: address,
    licensee_company_number: companyNumber,
    billing_method: 'invoice',
  };

  if (customer) {
    return stripe.customers.update(customer.id, {
      email,
      name: companyName,
      address: { line1: address },
      metadata: { ...customer.metadata, ...metadata },
    });
  }

  return stripe.customers.create({
    email,
    name: companyName,
    address: { line1: address },
    metadata,
  });
}

async function existingInvoiceResponse(stripe, license, responseLicense, trialLicense, priceId) {
  const subscriptionId = String(license?.stripe_subscription_id || '').trim();
  if (!subscriptionId) return null;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  });
  const prepaidInvoice = await ensurePrepaidTrialInvoice(stripe, {
    subscription,
    trialLicense,
    priceId,
    paymentMethodTypes: INVOICE_PAYMENT_METHODS,
    billingMethod: 'invoice',
    daysUntilDue: INVOICE_DAYS_UNTIL_DUE,
    cardConversionFlag: CARD_INVOICE_CONVERSION_FLAG,
  });
  if (prepaidInvoice?.invoice?.status !== 'paid') {
    return {
      ok: true,
      existing_invoice: true,
      billing_method: 'invoice',
      subscription_id: subscription.id,
      invoice_url: prepaidInvoice.invoice.hosted_invoice_url,
      url: prepaidInvoice.invoice.hosted_invoice_url,
      message: 'Die Rechnung für den vorausbezahlten Monat wurde geöffnet.',
      license: publicLicenseResponse(responseLicense, 'Prepaid invoice available'),
    };
  }
  if (subscription.collection_method !== 'send_invoice') {
    return {
      ok: true,
      already_active: true,
      message:
        'Für diese Installation ist bereits eine Kartenzahlung eingerichtet. Die Zahlungsart kann im Kundenportal geändert werden.',
      license: publicLicenseResponse(responseLicense, 'Card subscription already active'),
    };
  }

  await stripe.subscriptions.update(subscription.id, {
    payment_settings: {
      payment_method_types: INVOICE_PAYMENT_METHODS,
    },
    metadata: {
      ...subscription.metadata,
      billing_method: 'invoice',
      [CARD_INVOICE_CONVERSION_FLAG]: '',
    },
  });

  const latestInvoice =
    subscription.latest_invoice && typeof subscription.latest_invoice !== 'string'
      ? subscription.latest_invoice
      : null;
  if (latestInvoice?.status === 'open') {
    const invoice = await stripe.invoices.update(latestInvoice.id, {
      payment_settings: {
        payment_method_types: INVOICE_PAYMENT_METHODS,
      },
    });
    if (invoice.hosted_invoice_url) {
      return {
        ok: true,
        existing_invoice: true,
        billing_method: 'invoice',
        subscription_id: subscription.id,
        invoice_url: invoice.hosted_invoice_url,
        message: 'Die offene Rechnung wurde geöffnet.',
        license: publicLicenseResponse(responseLicense, 'Open invoice available'),
      };
    }
  }

  return {
    ok: true,
    already_active: true,
    message:
      subscription.status === 'trialing'
        ? 'Rechnungszahlung ist bereits eingerichtet. Die erste Rechnung wird zum Ende der Testphase erstellt.'
        : 'Rechnungszahlung ist bereits eingerichtet. Aktuell ist keine offene Rechnung vorhanden.',
    license: publicLicenseResponse(responseLicense, 'Invoice subscription already configured'),
  };
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!priceId) throw new Error('STRIPE_PRICE_ID is not configured.');

    const email = validEmail(body.licensee_email || body.email);
    const companyName = requiredText(
      body.licensee_name || body.company_name,
      'company_name',
      200,
    );
    const address = requiredText(body.licensee_address, 'licensee_address', 200);
    const companyNumber = optionalText(body.licensee_company_number, 120);
    const machineId = optionalText(body.machine_id, 200);

    const stripe = getStripe();
    const existingTrial = await findActiveTrialLicense({ machineId, email });
    const existingLicense = await findBillableSubscriptionLicense({ machineId, email });
    if (existingLicense) {
      const responseLicense = licenseForPaymentResponse(existingLicense, existingTrial);
      const existingResponse = await existingInvoiceResponse(
        stripe,
        existingLicense,
        responseLicense,
        existingTrial || existingLicense,
        priceId,
      );
      if (existingResponse) return json(existingResponse);
      return json({
        ok: true,
        already_active: true,
        message:
          'Für diese Installation ist bereits eine Lizenz vorhanden. Es wurde keine zweite Subscription erstellt.',
        license: publicLicenseResponse(responseLicense, 'License already active'),
      });
    }

    const prepaidPlan = prepaidTrialPlan(existingTrial);
    const customer = await findOrCreateCustomer(stripe, {
      email,
      companyName,
      address,
      companyNumber,
    });
    const metadata = prepaidMetadata(prepaidPlan, {
      app: 'lohnmail',
      company_name: companyName,
      licensee_name: companyName,
      licensee_email: email,
      licensee_address: address,
      licensee_company_number: companyNumber,
      machine_id: machineId,
      billing_method: 'invoice',
      previous_trial_license_id: existingTrial?.id || '',
      previous_trial_ends_at: existingTrial?.trial_ends_at || '',
    });
    const idempotencySource = [
      priceId,
      customer.id,
      machineId,
      email,
      existingTrial?.id || '',
    ].join(':');
    const idempotencyKey = `lohnmail-invoice-v2-${crypto
      .createHash('sha256')
      .update(idempotencySource)
      .digest('hex')}`;

    const recurringPrice = prepaidPlan ? await stripe.prices.retrieve(priceId) : null;
    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: priceId, quantity: 1 }],
        collection_method: 'send_invoice',
        days_until_due: INVOICE_DAYS_UNTIL_DUE,
        payment_settings: {
          payment_method_types: INVOICE_PAYMENT_METHODS,
        },
        ...(prepaidPlan ? { trial_end: prepaidPlan.trialEnd } : {}),
        ...(prepaidPlan
          ? {
              add_invoice_items: [
                {
                  price_data: oneTimePriceData(recurringPrice),
                  quantity: 1,
                },
              ],
            }
          : {}),
        metadata,
        expand: ['latest_invoice'],
      },
      { idempotencyKey },
    );

    const latestInvoice =
      subscription.latest_invoice && typeof subscription.latest_invoice !== 'string'
        ? subscription.latest_invoice
        : null;

    return json({
      ok: true,
      billing_method: 'invoice',
      subscription_id: subscription.id,
      status: subscription.status,
      days_until_due: INVOICE_DAYS_UNTIL_DUE,
      invoice_url:
        Number(latestInvoice?.amount_due || 0) > 0
          ? latestInvoice?.hosted_invoice_url || ''
          : '',
      message: prepaidPlan
        ? 'Die Rechnung für den vorausbezahlten Monat wurde erstellt.'
        : 'Rechnungszahlung eingerichtet. Stripe sendet die Rechnung per E-Mail.',
    });
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
