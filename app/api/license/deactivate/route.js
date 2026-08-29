import { json, readJson } from '../../../../lib/http.js';
import { query } from '../../../../lib/db.js';
import { findLicenseByKey } from '../../../../lib/license.js';
import { logLicenseOperation } from '../../../../lib/license-audit.js';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const license = await findLicenseByKey(body.license_key);
    const machineId = String(body.machine_id || '').trim();
    if (!license) {
      await logLicenseOperation({ operation: 'license.deactivate', outcome: 'not_found', source: 'desktop', licenseKey: body.license_key, machineId, request });
      return json({ ok: false, message: 'License not found' }, 404);
    }
    if (license.activated_machine_id && license.activated_machine_id !== machineId) {
      await logLicenseOperation({ operation: 'license.deactivate', outcome: 'machine_conflict', source: 'desktop', license, machineId, previousMachineId: license.activated_machine_id, request });
      return json({ ok: false, message: 'License is activated on another machine' }, 409);
    }
    await query(`update licenses set activated_machine_id = null where id = $1`, [license.id]);
    await logLicenseOperation({ operation: 'license.deactivate', outcome: 'success', source: 'desktop', license, machineId, previousMachineId: license.activated_machine_id, statusBefore: license.status, statusAfter: license.status, request });
    return json({ ok: true, message: 'License deactivated' });
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
