import { json, readJson } from '../../../../lib/http.js';
import { getStripe } from '../../../../lib/stripe.js';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const priceId = process.env.STRIPE_PRICE_ID;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!priceId) throw new Error('STRIPE_PRICE_ID is not configured.');
    if (!siteUrl) throw new Error('NEXT_PUBLIC_SITE_URL is not configured.');

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: body.email || undefined,
      allow_promotion_codes: true,
      success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cancel`,
      metadata: {
        app: 'lohnmail',
        company_name: body.company_name || '',
        machine_id: body.machine_id || '',
      },
      subscription_data: {
        metadata: {
          app: 'lohnmail',
          company_name: body.company_name || '',
          machine_id: body.machine_id || '',
          email: body.email || '',
        },
      },
    });

    return json({ ok: true, url: session.url, id: session.id });
  } catch (error) {
    return json({ ok: false, message: error.message }, 500);
  }
}
