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
    licensee_address: row.licensee_address,
    licensee_company_number: row.licensee_company_number,
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
    const licenseeAddress = cleanText(body.licensee_address);
    const licenseeCompanyNumber = cleanText(body.licensee_company_number);
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
               company_name = coalesce($2, company_name),
               licensee_address = coalesce($3, licensee_address),
               licensee_company_number = coalesce($4, licensee_company_number)
           where id = $5`,
          [email, companyName, licenseeAddress, licenseeCompanyNumber, license.customer_id],
        );
      }

      const result = await client.query(
        `update licenses
         set type = $1,
             status = $2,
             plan = $3,
             company_name = $4,
             email = $5,
             licensee_address = $6,
             licensee_company_number = $7,
             seats = $8,
             activated_machine_id = $9,
             trial_ends_at = $10,
             current_period_end = $11,
             note = $12,
             revoked_at = case
               when $2 = 'revoked' and revoked_at is null then now()
               when $2 <> 'revoked' then null
               else revoked_at
             end
         where id = $13
         returning *`,
        [
          type,
          status,
          plan,
          companyName,
          email,
          licenseeAddress,
          licenseeCompanyNumber,
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
