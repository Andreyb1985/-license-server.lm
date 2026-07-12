import { json, readJson, requireAdmin } from '../../../../../lib/http.js';
import { withTransaction } from '../../../../../lib/db.js';
import { insertLicense, publicLicenseResponse } from '../../../../../lib/license.js';

export async function POST(request) {
  if (!requireAdmin(request)) return json({ ok: false, message: 'Unauthorized' }, 401);
  try {
    const body = await readJson(request);
    const type = String(body.type || '').trim().toLowerCase();
    if (!['trial', 'lifetime', 'demo', 'internal'].includes(type)) {
      throw new Error('type must be trial, lifetime, demo or internal.');
    }

    const companyName = String(body.company_name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const licenseeAddress = String(body.licensee_address || '').trim();
    const licenseeCompanyNumber = String(body.licensee_company_number || '').trim();
    const seats = Math.max(1, Math.min(999, Number(body.seats || 1)));
    const expiresAt = String(body.expires_at || '').trim() || null;
    const defaultTrialEnd = new Date(Date.now() + 60 * 86400000).toISOString();
    const effectiveTrialEnd = expiresAt || defaultTrialEnd;
    const plan = String(body.plan || '').trim() || (type === 'trial' ? 'Trial' : type === 'lifetime' ? 'Lifetime' : type === 'internal' ? 'Internal' : 'Demo');

    if (!companyName) throw new Error('company_name is required.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('email is invalid.');

    const license = await withTransaction(async (client) => {
      let customerId = null;
      if (email) {
        const existing = await client.query(
          `select id from customers where lower(email) = $1 order by created_at desc limit 1`,
          [email],
        );
        if (existing.rows[0]) {
          customerId = existing.rows[0].id;
          await client.query(
            `update customers
             set company_name = coalesce(nullif($1, ''), company_name),
                 licensee_address = coalesce(nullif($2, ''), licensee_address),
                 licensee_company_number = coalesce(nullif($3, ''), licensee_company_number)
             where id = $4`,
            [companyName, licenseeAddress, licenseeCompanyNumber, customerId],
          );
        } else {
          const created = await client.query(
            `insert into customers (email, company_name, licensee_address, licensee_company_number) values ($1, $2, $3, $4) returning id`,
            [email, companyName, licenseeAddress || null, licenseeCompanyNumber || null],
          );
          customerId = created.rows[0].id;
        }
      }

      return insertLicense({
        customer_id: customerId,
        type,
        status: type === 'trial' ? 'trialing' : 'active',
        plan,
        company_name: companyName,
        licensee_address: licenseeAddress || null,
        licensee_company_number: licenseeCompanyNumber || null,
        email: email || null,
        seats,
        activated_machine_id: body.machine_id || null,
        trial_started_at: type === 'trial' ? new Date().toISOString() : null,
        trial_ends_at: type === 'trial' ? effectiveTrialEnd : (type === 'demo' && expiresAt ? expiresAt : null),
        current_period_end: type === 'trial' ? effectiveTrialEnd : (type === 'demo' && expiresAt ? expiresAt : null),
        created_by: 'admin-ui',
        note: body.note || null,
      }, client);
    });

    return json({ ok: true, ...publicLicenseResponse(license, 'Manual license created') });
  } catch (error) {
    return json({ ok: false, message: error.message }, 400);
  }
}
