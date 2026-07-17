import { json, readJson } from '../../../../lib/http.js';
import { withTransaction } from '../../../../lib/db.js';
import { findLicenseByKey, publicLicenseResponse } from '../../../../lib/license.js';

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

export async function POST(request) {
  try {
    const body = await readJson(request);
    const licenseKey = String(body.license_key || '').trim();
    const machineId = String(body.machine_id || '').trim();
    if (!licenseKey) throw new Error('license_key is required.');
    if (!machineId) throw new Error('machine_id is required.');

    const license = await findLicenseByKey(licenseKey);
    if (!license) return json({ ok: false, message: 'License not found' }, 404);
    if (!license.activated_machine_id || license.activated_machine_id !== machineId) {
      return json({ ok: false, message: 'License is not activated on this machine' }, 403);
    }

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
             licensee_company_number = $5
         where id = $6`,
        [customerId || null, companyName, email, licenseeAddress, licenseeCompanyNumber, license.id],
      );
    });

    const updated = await findLicenseByKey(licenseKey);
    return json({ ok: true, ...publicLicenseResponse(updated, 'Licensee details updated') });
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
