import { json, readJson, requireAdmin } from '../../../../../lib/http.js';
import { insertLicense, publicLicenseResponse } from '../../../../../lib/license.js';

export async function POST(request) {
  if (!requireAdmin(request)) return json({ ok: false, message: 'Unauthorized' }, 401);
  try {
    const body = await readJson(request);
    const type = String(body.type || '').trim().toLowerCase();
    if (!['lifetime', 'demo', 'internal'].includes(type)) {
      throw new Error('type must be lifetime, demo or internal.');
    }
    const license = await insertLicense({
      type,
      status: 'active',
      plan: type === 'lifetime' ? 'Lifetime' : type === 'internal' ? 'Internal' : 'Demo',
      company_name: body.company_name || null,
      email: body.email || null,
      seats: Number(body.seats || 1),
      trial_ends_at: type === 'demo' && body.expires_at ? body.expires_at : null,
      current_period_end: type === 'demo' && body.expires_at ? body.expires_at : null,
      created_by: 'admin-api',
      note: body.note || null,
    });
    return json({ ok: true, ...publicLicenseResponse(license, 'Manual license created') });
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
