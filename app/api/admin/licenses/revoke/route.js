import { json, readJson, requireAdmin } from '../../../../../lib/http.js';
import { query } from '../../../../../lib/db.js';
import { findLicenseByKey } from '../../../../../lib/license.js';
import { logLicenseOperation } from '../../../../../lib/license-audit.js';

export async function POST(request) {
  if (!requireAdmin(request)) return json({ ok: false, message: 'Unauthorized' }, 401);
  try {
    const body = await readJson(request);
    const license = await findLicenseByKey(body.license_key);
    if (!license) return json({ ok: false, message: 'License not found' }, 404);
    const updated = await query(`update licenses set status = 'revoked', revoked_at = now() where id = $1 returning *`, [license.id]);
    await logLicenseOperation({ operation: 'admin.revoke', outcome: 'success', source: 'admin', license: updated.rows[0], machineId: updated.rows[0].activated_machine_id, statusBefore: license.status, statusAfter: 'revoked', request });
    return json({ ok: true, status: 'revoked', license_key: license.license_key });
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
