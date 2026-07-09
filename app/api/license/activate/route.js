import { json, readJson } from '../../../../lib/http.js';
import { query } from '../../../../lib/db.js';
import { ACTIVE_STATUSES, findLicenseByKey, publicLicenseResponse } from '../../../../lib/license.js';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const licenseKey = String(body.license_key || '').trim();
    const machineId = String(body.machine_id || '').trim();
    if (!licenseKey) throw new Error('license_key is required.');
    if (!machineId) throw new Error('machine_id is required.');

    const license = await findLicenseByKey(licenseKey);
    if (!license) return json({ status: 'invalid', active: false, message: 'License not found' }, 404);
    if (!ACTIVE_STATUSES.has(license.status)) {
      return json(publicLicenseResponse(license, 'License is not active'), 400);
    }
    if (license.activated_machine_id && license.activated_machine_id !== machineId && Number(license.seats || 1) <= 1) {
      return json({ status: 'invalid', active: false, message: 'License is already activated on another machine' }, 409);
    }

    const result = await query(
      `update licenses set activated_machine_id = coalesce(activated_machine_id, $1), last_check_at = now() where id = $2 returning *`,
      [machineId, license.id],
    );
    return json(publicLicenseResponse(result.rows[0], 'License activated'));
  } catch (error) {
    return json({ status: 'invalid', active: false, message: error.message }, 400);
  }
}
