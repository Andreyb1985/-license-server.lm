import { json, readJson, requireAdmin } from '../../../../../lib/http.js';
import { withTransaction } from '../../../../../lib/db.js';
import { findLicenseByKey, publicLicenseResponse } from '../../../../../lib/license.js';

const ALLOWED_TYPES = new Set(['trial', 'subscription', 'lifetime', 'demo', 'internal']);
const ALLOWED_STATUSES = new Set([
  'trialing',
  'active',
  'expiring_soon',
  'past_due',
  'unpaid',
  'canceled',
  'expired',
  'refunded',
  'disputed',
  'revoked',
  'invalid',
  'no_connection',
]);

function cleanText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('email is invalid.');
  return email;
}

function cleanDate(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new Error(`${value} is not a valid date.`);
  return date.toISOString();
}

function cleanSeats(value) {
  const seats = Number(value || 1);
  if (!Number.isFinite(seats)) return 1;
  return Math.max(1, Math.min(999, Math.floor(seats)));
}

function adminLicenseResponse(row, message) {
  return {
    ...publicLicenseResponse(row, message),
    id: row.id,
    customer_id: row.customer_id,
    activated_machine_id: row.activated_machine_id,
    stripe_customer_id: row.stripe_customer_id,
    stripe_subscription_id: row.stripe_subscription_id,
    last_check_at: row.last_check_at,
    created_by: row.created_by,
    note: row.note,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function POST(request) {
  if (!requireAdmin(request)) return json({ ok: false, message: 'Unauthorized' }, 401);

  try {
    const body = await readJson(request);
    const license = await findLicenseByKey(body.license_key);
    if (!license) return json({ ok: false, message: 'License not found' }, 404);

    const type = String(body.type || license.type || '').trim().toLowerCase();
    const status = String(body.status || license.status || '').trim().toLowerCase();
    if (!ALLOWED_TYPES.has(type)) throw new Error('type is invalid.');
    if (!ALLOWED_STATUSES.has(status)) throw new Error('status is invalid.');

    const email = cleanEmail(body.email);
    const companyName = cleanText(body.company_name);
    const plan = cleanText(body.plan) || 'Professional';
    const machineId = cleanText(body.activated_machine_id);
    const note = cleanText(body.note);
    const trialEndsAt = cleanDate(body.trial_ends_at);
    const currentPeriodEnd = cleanDate(body.current_period_end);
    const seats = cleanSeats(body.seats);

    const updated = await withTransaction(async (client) => {
      if (license.customer_id) {
        await client.query(
          `update customers
           set email = coalesce($1, email),
               company_name = coalesce($2, company_name)
           where id = $3`,
          [email, companyName, license.customer_id],
        );
      }

      const result = await client.query(
        `update licenses
         set type = $1,
             status = $2,
             plan = $3,
             company_name = $4,
             email = $5,
             seats = $6,
             activated_machine_id = $7,
             trial_ends_at = $8,
             current_period_end = $9,
             note = $10,
             revoked_at = case
               when $2 = 'revoked' and revoked_at is null then now()
               when $2 <> 'revoked' then null
               else revoked_at
             end
         where id = $11
         returning *`,
        [
          type,
          status,
          plan,
          companyName,
          email,
          seats,
          machineId,
          trialEndsAt,
          currentPeriodEnd,
          note,
          license.id,
        ],
      );

      return result.rows[0];
    });

    return json({ ok: true, ...adminLicenseResponse(updated, 'License updated') });
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
