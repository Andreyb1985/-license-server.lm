import { json, readJson, requireAdmin } from '../../../../../lib/http.js';
import { query, withTransaction } from '../../../../../lib/db.js';
import { findLicenseByKey, publicLicenseResponse } from '../../../../../lib/license.js';

function appendNote(note, line) {
  return [String(note || '').trim(), line].filter(Boolean).join('\n');
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
    const action = String(body.action || '').trim().toLowerCase();
    const license = await findLicenseByKey(body.license_key);
    if (!license) return json({ ok: false, message: 'License not found' }, 404);

    if (action === 'release_machine') {
      const updated = await query(
        `update licenses
         set activated_machine_id = null,
             note = $1
         where id = $2
         returning *`,
        [appendNote(license.note, `Machine ID released manually at ${new Date().toISOString()}.`), license.id],
      );
      return json({ ok: true, ...adminLicenseResponse(updated.rows[0], 'Machine ID released') });
    }

    if (action === 'revoke') {
      const updated = await query(
        `update licenses
         set status = 'revoked',
             revoked_at = now(),
             note = $1
         where id = $2
         returning *`,
        [appendNote(license.note, `License revoked manually at ${new Date().toISOString()}.`), license.id],
      );
      return json({ ok: true, ...adminLicenseResponse(updated.rows[0], 'License revoked') });
    }

    if (action === 'reactivate') {
      if (license.stripe_subscription_id) {
        throw new Error('Stripe subscription licenses must be reactivated by Stripe webhook/check.');
      }
      const updated = await query(
        `update licenses
         set status = case when type = 'trial' then 'trialing' else 'active' end,
             revoked_at = null,
             note = $1
         where id = $2
         returning *`,
        [appendNote(license.note, `License reactivated manually at ${new Date().toISOString()}.`), license.id],
      );
      return json({ ok: true, ...adminLicenseResponse(updated.rows[0], 'License reactivated') });
    }

    if (action === 'delete') {
      if (license.stripe_subscription_id) {
        throw new Error('Stripe subscription licenses cannot be deleted. Revoke the license instead.');
      }

      await withTransaction(async (client) => {
        await client.query(`delete from license_checks where upper(license_key) = upper($1)`, [license.license_key]);
        await client.query(`delete from licenses where id = $1`, [license.id]);
      });

      return json({
        ok: true,
        status: 'deleted',
        license_key: license.license_key,
        license_key_masked: publicLicenseResponse(license).license_key_masked,
        message: 'License deleted',
      });
    }

    throw new Error('action must be release_machine, revoke, reactivate or delete.');
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
