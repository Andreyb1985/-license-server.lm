import { json, readJson, requireAdmin } from '../../../../../lib/http.js';
import { query } from '../../../../../lib/db.js';
import { findLicenseByKey } from '../../../../../lib/license.js';

export async function POST(request) {
  if (!requireAdmin(request)) return json({ ok: false, message: 'Unauthorized' }, 401);
  try {
    const body = await readJson(request);
    const license = await findLicenseByKey(body.license_key);
    if (!license) return json({ ok: false, message: 'License not found' }, 404);
    await query(`update licenses set status = 'revoked', revoked_at = now() where id = $1`, [license.id]);
    return json({ ok: true, status: 'revoked', license_key: license.license_key });
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
