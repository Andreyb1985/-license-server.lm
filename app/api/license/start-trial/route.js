import { json, readJson } from '../../../../lib/http.js';
import { findLicenseByMachine, insertLicense, publicLicenseResponse } from '../../../../lib/license.js';
import { logLicenseOperation } from '../../../../lib/license-audit.js';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const machineId = String(body.machine_id || '').trim();
    if (!machineId) throw new Error('machine_id is required.');

    const existing = await findLicenseByMachine(machineId);
    if (existing) {
      await logLicenseOperation({
        operation: 'trial.lookup',
        outcome: 'existing',
        source: 'desktop',
        license: existing,
        machineId,
        statusAfter: existing.status,
        request,
        appVersion: body.app_version,
        details: { message: 'Existing license returned for machine ID.' },
      });
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

    await logLicenseOperation({
      operation: 'trial.create',
      outcome: 'created',
      source: 'desktop',
      license,
      machineId,
      statusAfter: license.status,
      request,
      appVersion: body.app_version,
      details: { trial_ends_at: license.trial_ends_at },
    });

    return json(publicLicenseResponse(license, 'Trial active'));
  } catch (error) {
    await logLicenseOperation({
      operation: 'trial.start',
      outcome: 'error',
      source: 'desktop',
      request,
      details: { error: error.message },
    }).catch(() => {});
    return json({ status: 'invalid', active: false, message: error.message }, 400);
  }
}
