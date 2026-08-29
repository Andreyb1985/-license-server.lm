import { json, readJson } from '../../../../lib/http.js';
import { query } from '../../../../lib/db.js';
import { ACTIVE_STATUSES, findLicenseByKey, publicLicenseResponse } from '../../../../lib/license.js';
import { logLicenseOperation } from '../../../../lib/license-audit.js';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const licenseKey = String(body.license_key || '').trim();
    const machineId = String(body.machine_id || '').trim();
    if (!licenseKey) throw new Error('license_key is required.');
    if (!machineId) throw new Error('machine_id is required.');

    const license = await findLicenseByKey(licenseKey);
    if (!license) {
      await logLicenseOperation({ operation: 'license.activate', outcome: 'not_found', source: 'desktop', licenseKey, machineId, request, appVersion: body.app_version });
      return json({ status: 'invalid', active: false, message: 'License not found' }, 404);
    }
    if (!ACTIVE_STATUSES.has(license.status)) {
      await logLicenseOperation({ operation: 'license.activate', outcome: 'inactive', source: 'desktop', license, machineId, statusAfter: license.status, request, appVersion: body.app_version });
      return json(publicLicenseResponse(license, 'License is not active'), 400);
    }
    if (license.activated_machine_id && license.activated_machine_id !== machineId && Number(license.seats || 1) <= 1) {
      await logLicenseOperation({ operation: 'license.activate', outcome: 'machine_conflict', source: 'desktop', license, machineId, previousMachineId: license.activated_machine_id, statusAfter: license.status, request, appVersion: body.app_version });
      return json({ status: 'invalid', active: false, message: 'License is already activated on another machine' }, 409);
    }

    const result = await query(
      `update licenses set activated_machine_id = coalesce(activated_machine_id, $1), last_check_at = now() where id = $2 returning *`,
      [machineId, license.id],
    );
    await logLicenseOperation({ operation: 'license.activate', outcome: 'success', source: 'desktop', license: result.rows[0], machineId, previousMachineId: license.activated_machine_id, statusBefore: license.status, statusAfter: result.rows[0].status, request, appVersion: body.app_version });
    return json(publicLicenseResponse(result.rows[0], 'License activated'));
  } catch (error) {
    return json({ status: 'invalid', active: false, message: error.message }, 400);
  }
}
