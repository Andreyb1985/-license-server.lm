#!/usr/bin/env node
import { insertLicense, publicLicenseResponse } from '../lib/license.js';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function main() {
  const type = arg('type');
  if (!['lifetime', 'demo', 'internal'].includes(type)) {
    throw new Error('--type must be lifetime, demo or internal');
  }
  const license = await insertLicense({
    type,
    status: 'active',
    plan: type === 'lifetime' ? 'Lifetime' : type === 'internal' ? 'Internal' : 'Demo',
    email: arg('email') || null,
    company_name: arg('company') || null,
    seats: Number(arg('seats', '1')),
    current_period_end: arg('expires') || null,
    trial_ends_at: type === 'demo' ? arg('expires') || null : null,
    created_by: 'admin-script',
    note: arg('note') || null,
  });
  console.log(JSON.stringify(publicLicenseResponse(license, 'Manual license created'), null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
