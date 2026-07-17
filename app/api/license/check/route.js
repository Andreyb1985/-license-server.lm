import { json, readJson } from '../../../../lib/http.js';
import { query, withTransaction } from '../../../../lib/db.js';
import { ACTIVE_STATUSES, findLicenseByKey, logLicenseCheck, publicLicenseResponse } from '../../../../lib/license.js';

function cleanText(value, maxLength) {
  const normalized = String(value || '').trim();
  if (normalized.length > maxLength) {
    throw new Error(`Value exceeds the maximum length of ${maxLength} characters.`);
  }
  return normalized || null;
}

function cleanEmail(value) {
  const email = cleanText(value, 320);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('licensee_email is invalid.');
  }
  return email ? email.toLowerCase() : null;
}

async function updateLicensee(license, body) {
  const companyName = cleanText(body.licensee_name, 200);
  const email = cleanEmail(body.licensee_email);
  const licenseeAddress = cleanText(body.licensee_address, 500);
  const licenseeCompanyNumber = cleanText(body.licensee_company_number, 120);

  await withTransaction(async (client) => {
    let customerId = license.customer_id;
    if (customerId) {
      await client.query(
        `update customers
         set company_name = $1,
             email = $2,
             licensee_address = $3,
             licensee_company_number = $4
         where id = $5`,
        [companyName, email, licenseeAddress, licenseeCompanyNumber, customerId],
      );
    } else if (companyName || email || licenseeAddress || licenseeCompanyNumber) {
      const customer = await client.query(
        `insert into customers (company_name, email, licensee_address, licensee_company_number)
         values ($1, $2, $3, $4)
         returning id`,
        [companyName, email, licenseeAddress, licenseeCompanyNumber],
      );
      customerId = customer.rows[0].id;
    }

    await client.query(
      `update licenses
       set customer_id = $1,
           company_name = $2,
           email = $3,
           licensee_address = $4,
           licensee_company_number = $5,
           last_check_at = now()
       where id = $6`,
      [customerId || null, companyName, email, licenseeAddress, licenseeCompanyNumber, license.id],
    );
  });
}

export async function POST(request) {
  const body = await readJson(request);
  const action = String(body.action || '').trim();
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

    if (action === 'update_licensee') {
      if (!license.activated_machine_id || license.activated_machine_id !== machineId) {
        return json({ status: 'invalid', active: false, message: 'License is not activated on this machine' }, 403);
      }
      await updateLicensee(license, body);
      const updated = await findLicenseByKey(licenseKey);
      await logLicenseCheck({ licenseKey, machineId, status: updated.status, request, appVersion });
      return json(publicLicenseResponse(updated, 'Licensee details updated'));
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
        `select l.*,
                related_trial.trial_ends_at as related_trial_ends_at,
                related_trial.license_key as related_trial_license_key
         from licenses l
         left join lateral (
           select t.trial_ends_at, t.license_key
           from licenses t
           where t.id <> l.id
             and t.type = 'trial'
             and t.status = 'trialing'
             and t.trial_ends_at > now()
             and t.activated_machine_id = l.activated_machine_id
           order by t.trial_ends_at desc, t.created_at desc
           limit 1
         ) related_trial on true
         where l.activated_machine_id = $1
           and l.status in ('trialing','active','expiring_soon')
           and l.type in ('subscription','lifetime','demo','internal')
         order by l.created_at desc
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
