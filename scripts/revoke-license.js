#!/usr/bin/env node
import { query } from '../lib/db.js';
import { findLicenseByKey } from '../lib/license.js';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function main() {
  const licenseKey = arg('license-key');
  if (!licenseKey) throw new Error('--license-key is required');
  const license = await findLicenseByKey(licenseKey);
  if (!license) throw new Error('License not found');
  await query(`update licenses set status = 'revoked', revoked_at = now() where id = $1`, [license.id]);
  console.log(JSON.stringify({ ok: true, status: 'revoked', license_key: license.license_key }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
