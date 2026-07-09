import { json, readJson } from '../../../../lib/http.js';
import { query } from '../../../../lib/db.js';
import { getStripe } from '../../../../lib/stripe.js';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) throw new Error('NEXT_PUBLIC_SITE_URL is not configured.');

    let stripeCustomerId = body.stripe_customer_id;
    if (!stripeCustomerId && body.license_key) {
      const result = await query(
        `select stripe_customer_id from licenses where upper(license_key) = upper($1) limit 1`,
        [body.license_key],
      );
      stripeCustomerId = result.rows[0]?.stripe_customer_id;
    }
    if (!stripeCustomerId) throw new Error('Stripe customer id not found.');

    const session = await getStripe().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: siteUrl,
    });
    return json({ ok: true, url: session.url });
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
