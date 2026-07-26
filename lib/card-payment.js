const CARD_CONVERSION_ACTION = 'convert_invoice_subscription_to_card';

function objectId(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : String(value.id || '');
}

function expandedLatestInvoice(subscription) {
  const invoice = subscription?.latest_invoice;
  return invoice && typeof invoice !== 'string' ? invoice : null;
}

function metadataValue(value) {
  return String(value || '').trim();
}

export async function createCardSetupSession(
  stripe,
  {
    subscription,
    siteUrl,
    license = {},
  },
) {
  const subscriptionId = objectId(subscription);
  const customerId = objectId(subscription?.customer);
  if (!subscriptionId || !customerId) {
    throw new Error('Die bestehende Stripe-Subscription ist unvollständig.');
  }

  const metadata = {
    app: 'lohnmail',
    action: CARD_CONVERSION_ACTION,
    stripe_subscription_id: subscriptionId,
    company_name: metadataValue(license.company_name),
    licensee_name: metadataValue(license.company_name),
    licensee_email: metadataValue(license.email),
    licensee_address: metadataValue(license.licensee_address),
    licensee_company_number: metadataValue(license.licensee_company_number),
    machine_id: metadataValue(license.activated_machine_id),
    billing_method: 'card',
  };

  return stripe.checkout.sessions.create({
    mode: 'setup',
    customer: customerId,
    payment_method_types: ['card'],
    success_url: `${siteUrl}/success?payment_method=card&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/cancel`,
    metadata,
    setup_intent_data: { metadata },
  });
}

export function isCardConversionSession(session) {
  return (
    session?.mode === 'setup'
    && session?.metadata?.action === CARD_CONVERSION_ACTION
    && Boolean(session?.metadata?.stripe_subscription_id)
  );
}

export async function completeCardConversion(stripe, session) {
  if (!isCardConversionSession(session)) {
    return { handled: false };
  }

  const subscriptionId = metadataValue(session.metadata.stripe_subscription_id);
  const setupIntentId = objectId(session.setup_intent);
  if (!setupIntentId) {
    throw new Error('Stripe hat keine Zahlungsdaten für die Kartenumstellung geliefert.');
  }

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const paymentMethodId = objectId(setupIntent.payment_method);
  if (!paymentMethodId || setupIntent.status !== 'succeeded') {
    throw new Error('Die Karte wurde von Stripe nicht bestätigt.');
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  });
  const subscriptionCustomerId = objectId(subscription.customer);
  const sessionCustomerId = objectId(session.customer);
  if (!subscriptionCustomerId || subscriptionCustomerId !== sessionCustomerId) {
    throw new Error('Die Zahlungsdaten gehören nicht zum Kunden dieser Subscription.');
  }

  const latestInvoice = expandedLatestInvoice(subscription);
  let paidInvoice = null;
  if (
    latestInvoice?.status === 'open'
    && Number(latestInvoice.amount_remaining ?? latestInvoice.amount_due ?? 0) > 0
  ) {
    try {
      paidInvoice = await stripe.invoices.pay(latestInvoice.id, {
        payment_method: paymentMethodId,
      });
    } catch (error) {
      return {
        handled: true,
        converted: false,
        subscription,
        invoice: latestInvoice,
        message: `Die Karte wurde gespeichert, aber die offene Rechnung konnte nicht bezahlt werden: ${error.message}`,
      };
    }

    if (paidInvoice.status !== 'paid') {
      return {
        handled: true,
        converted: false,
        subscription,
        invoice: paidInvoice,
        message: 'Die Karte wurde gespeichert, aber die offene Rechnung ist noch nicht bezahlt.',
      };
    }
  }

  const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
    collection_method: 'charge_automatically',
    default_payment_method: paymentMethodId,
    payment_settings: {
      payment_method_types: ['card'],
      save_default_payment_method: 'on_subscription',
    },
    metadata: {
      ...subscription.metadata,
      billing_method: 'card',
    },
  });

  return {
    handled: true,
    converted: true,
    subscription: updatedSubscription,
    invoice: paidInvoice,
    paymentMethodId,
    message: paidInvoice
      ? 'Die Rechnung wurde bezahlt und die automatische Kartenzahlung aktiviert.'
      : 'Die automatische Kartenzahlung wurde aktiviert.',
  };
}

export { CARD_CONVERSION_ACTION };
