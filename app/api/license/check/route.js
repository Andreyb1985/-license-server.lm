import { json, readJson } from '../../../../lib/http.js';
import { query } from '../../../../lib/db.js';
import { ACTIVE_STATUSES, findLicenseByKey, logLicenseCheck, publicLicenseResponse } from '../../../../lib/license.js';

export async function POST(request) {
  const body = await readJson(request);
  const licenseKey = String(body.license_key || '').trim();
  const machineId = String(body.machine_id || '').trim();
  const appVersion = String(body.app_version || '').trim();

  try {
    if (!licenseKey) throw new Error('license_key is required.');
    if (!machineId) throw new Error('machine_id is required.');
    const license = await findLicenseByKey(licenseKey);
    if (!license) {
      await logLicenseCheck({ licenseKey, machineId, status: 'invalid', request, appVersion });
      return json({ status: 'invalid', type: 'invalid', active: false, message: 'License not found' }, 404);
    }

    let status = license.status;
    if (license.status !== 'revoked' && license.type === 'trial' && license.trial_ends_at && new Date(license.trial_ends_at) < new Date()) {
      status = 'expired';
      await query(`update licenses set status = 'expired' where id = $1`, [license.id]);
    }
    if (license.activated_machine_id && license.activated_machine_id !== machineId && Number(license.seats || 1) <= 1) {
      status = 'invalid';
    }
    if ((license.type === 'trial' || !ACTIVE_STATUSES.has(status)) && license.activated_machine_id === machineId) {
      const replacement = await query(
        `select *
         from licenses
         where activated_machine_id = $1
           and status in ('trialing','active','expiring_soon')
           and type in ('subscription','lifetime','demo','internal')
         order by created_at desc
         limit 1`,
        [machineId],
      );
      if (replacement.rows[0]) {
        const nextLicense = replacement.rows[0];
        await query(`update licenses set last_check_at = now() where id = $1`, [nextLicense.id]);
        await logLicenseCheck({ licenseKey: nextLicense.license_key, machineId, status: nextLicense.status, request, appVersion });
        return json(publicLicenseResponse(nextLicense, 'Paid license linked to this machine'));
      }
    }

    await query(`update licenses set last_check_at = now() where id = $1`, [license.id]);
    await logLicenseCheck({ licenseKey, machineId, status, request, appVersion });
    return json(publicLicenseResponse({ ...license, status }, status === 'invalid' ? 'License bound to another machine' : 'License checked'));
  } catch (error) {
    await logLicenseCheck({ licenseKey, machineId, status: 'invalid', request, appVersion }).catch(() => {});
    return json({ status: 'invalid', active: false, message: error.message }, 400);
  }
}
