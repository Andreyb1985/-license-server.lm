import { json, readJson } from '../../../../lib/http.js';
import { findLicenseByMachine, insertLicense, publicLicenseResponse } from '../../../../lib/license.js';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const machineId = String(body.machine_id || '').trim();
    if (!machineId) throw new Error('machine_id is required.');

    const existing = await findLicenseByMachine(machineId);
    if (existing) {
      return json(publicLicenseResponse(existing, 'Existing license found'));
    }

    const now = new Date();
    const ends = new Date(now.getTime() + 60 * 86400000);
    const license = await insertLicense({
      type: 'trial',
      status: 'trialing',
      plan: 'Trial',
      email: body.email || null,
      company_name: body.company_name || null,
      seats: 1,
      activated_machine_id: machineId,
      trial_started_at: now.toISOString(),
      trial_ends_at: ends.toISOString(),
      last_check_at: now.toISOString(),
      created_by: 'start-trial',
      note: `Trial started from ${body.app_version || 'unknown app version'}`,
    });

    return json(publicLicenseResponse(license, 'Trial active'));
  } catch (error) {
    return json({ status: 'invalid', active: false, message: error.message }, 400);
  }
}
