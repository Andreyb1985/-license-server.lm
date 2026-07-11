import { json, readJson, requireAdmin } from '../../../../../lib/http.js';
import { query } from '../../../../../lib/db.js';
import { getStripe } from '../../../../../lib/stripe.js';
import { findLicenseByKey, publicLicenseResponse } from '../../../../../lib/license.js';

function toUnix(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) throw new Error('trial_ends_at is invalid.');
  return Math.floor(time / 1000);
}

export async function POST(request) {
  if (!requireAdmin(request)) return json({ ok: false, message: 'Unauthorized' }, 401);
  try {
    const body = await readJson(request);
    const action = String(body.action || '').trim().toLowerCase();
    const license = await findLicenseByKey(body.license_key);
    if (!license) return json({ ok: false, message: 'License not found' }, 404);

    if (action === 'set') {
      const trialEndsAt = String(body.trial_ends_at || '').trim();
      const trialEndUnix = toUnix(trialEndsAt);
      if (trialEndUnix <= Math.floor(Date.now() / 1000)) throw new Error('trial_ends_at must be in the future.');

      if (license.stripe_subscription_id) {
        await getStripe().subscriptions.update(license.stripe_subscription_id, { trial_end: trialEndUnix });
        await query(
          `update subscriptions
           set status = 'trialing', trial_end = $1, current_period_end = $1
           where stripe_subscription_id = $2`,
          [new Date(trialEndUnix * 1000).toISOString(), license.stripe_subscription_id],
        );
      }

      const updated = await query(
        `update licenses
         set status = case when type in ('trial','subscription') then 'trialing' else status end,
             trial_started_at = coalesce(trial_started_at, now()),
             trial_ends_at = $1,
             current_period_end = case when type in ('trial','subscription','demo') then $1 else current_period_end end,
             note = trim(both from coalesce(note, '') || E'\n' || $2)
         where id = $3
         returning *`,
        [new Date(trialEndUnix * 1000).toISOString(), `Trial set manually until ${new Date(trialEndUnix * 1000).toISOString()}.`, license.id],
      );
      return json({ ok: true, ...publicLicenseResponse(updated.rows[0], 'Trial updated') });
    }

    if (action === 'cancel') {
      if (license.stripe_subscription_id && license.status === 'trialing') {
        await getStripe().subscriptions.update(license.stripe_subscription_id, { trial_end: 'now' });
      }
      const updated = await query(
        `update licenses
         set status = case when type = 'trial' then 'expired' else 'active' end,
             trial_ends_at = now(),
             current_period_end = case when type = 'trial' then now() else current_period_end end,
             note = trim(both from coalesce(note, '') || E'\n' || $1)
         where id = $2
         returning *`,
        ['Trial canceled manually.', license.id],
      );
      return json({ ok: true, ...publicLicenseResponse(updated.rows[0], 'Trial canceled') });
    }

    throw new Error('action must be set or cancel.');
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
