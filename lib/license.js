import crypto from 'crypto';
import { query } from './db.js';

const PREFIX_BY_TYPE = {
  trial: 'LM-TRIAL',
  subscription: 'LM-PRO',
  lifetime: 'LM-LIFE',
  demo: 'LM-DEMO',
  internal: 'LM-DEV',
};

const ACTIVE_STATUSES = new Set(['trialing', 'active', 'expiring_soon']);
const BLOCKED_STATUSES = new Set(['expired', 'unpaid', 'canceled', 'refunded', 'disputed', 'revoked', 'invalid']);

function nowIso() {
  return new Date().toISOString();
}

function requireLicenseSecret() {
  if (!process.env.LICENSE_SECRET) {
    throw new Error('LICENSE_SECRET is not configured.');
  }
  return process.env.LICENSE_SECRET;
}

export function generateLicenseKey(type) {
  const prefix = PREFIX_BY_TYPE[type] || PREFIX_BY_TYPE.subscription;
  const parts = Array.from({ length: 3 }, () => crypto.randomBytes(3).toString('hex').toUpperCase());
  return `${prefix}-${parts.join('-')}`;
}

export function hashLicenseKey(licenseKey) {
  return crypto.createHmac('sha256', requireLicenseSecret()).update(String(licenseKey).trim().toUpperCase()).digest('hex');
}

export function maskLicenseKey(licenseKey) {
  if (!licenseKey) return '';
  const value = String(licenseKey);
  return `${value.slice(0, 8)}-••••-${value.slice(-4)}`;
}

export function daysRemaining(dateValue) {
  if (!dateValue) return null;
  const ms = new Date(dateValue).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export function stripeStatusToLicenseStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'trialing') return 'trialing';
  if (normalized === 'active') return 'active';
  if (normalized === 'past_due') return 'past_due';
  if (normalized === 'unpaid') return 'unpaid';
  if (normalized === 'canceled') return 'canceled';
  if (normalized === 'incomplete') return 'past_due';
  if (normalized === 'incomplete_expired') return 'expired';
  if (normalized === 'paused') return 'past_due';
  return 'invalid';
}

function resolveQueryExecutor(executor) {
  if (typeof executor === 'function') return executor;
  return executor.query.bind(executor);
}

function normalizeLicenseRow(row) {
  if (!row) return null;
  let status = row.status;
  if (row.status !== 'revoked' && row.type === 'trial' && row.trial_ends_at && new Date(row.trial_ends_at) < new Date()) {
    status = 'expired';
  }
  return { ...row, status };
}

export async function findLicenseByKey(licenseKey) {
  const key = String(licenseKey || '').trim();
  if (!key) return null;
  const hash = hashLicenseKey(key);
  const result = await query(
    `select * from licenses where license_key_hash = $1 or upper(license_key) = upper($2) order by created_at desc limit 1`,
    [hash, key],
  );
  return normalizeLicenseRow(result.rows[0]);
}

export async function findLicenseByMachine(machineId) {
  const result = await query(
    `select * from licenses where activated_machine_id = $1 order by created_at desc limit 1`,
    [machineId],
  );
  return normalizeLicenseRow(result.rows[0]);
}

export async function insertLicense(fields, executor = query) {
  const licenseKey = fields.license_key || generateLicenseKey(fields.type);
  const runQuery = resolveQueryExecutor(executor);
  const result = await runQuery(
    `insert into licenses (
      customer_id, license_key, license_key_hash, type, status, plan, company_name, email, seats,
      activated_machine_id, stripe_customer_id, stripe_subscription_id, trial_started_at, trial_ends_at,
      current_period_end, last_check_at, created_by, note
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
    ) returning *`,
    [
      fields.customer_id || null,
      licenseKey,
      hashLicenseKey(licenseKey),
      fields.type,
      fields.status,
      fields.plan || 'Professional',
      fields.company_name || null,
      fields.email || null,
      fields.seats || 1,
      fields.activated_machine_id || null,
      fields.stripe_customer_id || null,
      fields.stripe_subscription_id || null,
      fields.trial_started_at || null,
      fields.trial_ends_at || null,
      fields.current_period_end || null,
      fields.last_check_at || null,
      fields.created_by || 'server',
      fields.note || null,
    ],
  );
  return normalizeLicenseRow(result.rows[0]);
}

export async function logLicenseCheck({ licenseKey, machineId, status, request, appVersion }) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || null;
  await query(
    `insert into license_checks (license_key, machine_id, status, ip, app_version) values ($1,$2,$3,$4,$5)`,
    [licenseKey || '', machineId || '', status || 'invalid', ip, appVersion || null],
  );
}

export function publicLicenseResponse(row, message = '') {
  const license = normalizeLicenseRow(row);
  if (!license) {
    return { status: 'invalid', type: 'invalid', active: false, message: message || 'License not found' };
  }
  const dateForRemaining = license.trial_ends_at || license.current_period_end;
  return {
    status: license.status,
    type: license.type,
    plan: license.plan || 'Professional',
    active: ACTIVE_STATUSES.has(license.status),
    blocked: BLOCKED_STATUSES.has(license.status),
    license_key: license.license_key,
    license_key_masked: maskLicenseKey(license.license_key),
    days_remaining: daysRemaining(dateForRemaining),
    trial_ends_at: license.trial_ends_at,
    current_period_end: license.current_period_end,
    company_name: license.company_name,
    email: license.email,
    seats: license.seats,
    message: message || (ACTIVE_STATUSES.has(license.status) ? 'License active' : 'License not active'),
  };
}

export { ACTIVE_STATUSES, BLOCKED_STATUSES, nowIso };
