import { query } from './db.js';

const MAX_DETAILS_BYTES = 8000;
let schemaPromise;

export function ensureLicenseOperationsTable(executor = query) {
  if (!schemaPromise || executor !== query) {
    const runQuery = typeof executor === 'function' ? executor : executor.query.bind(executor);
    const promise = runQuery(
      `create table if not exists license_operations (
         id uuid primary key default gen_random_uuid(),
         operation text not null,
         outcome text not null,
         source text not null,
         license_id uuid references licenses(id) on delete set null,
         license_key text,
         machine_id text,
         previous_machine_id text,
         status_before text,
         status_after text,
         ip text,
         app_version text,
         details jsonb not null default '{}'::jsonb,
         created_at timestamptz not null default now()
       )`,
    ).then(async () => {
      await Promise.all([
        runQuery(`create index if not exists license_operations_created_idx on license_operations (created_at desc)`),
        runQuery(`create index if not exists license_operations_key_idx on license_operations (license_key)`),
        runQuery(`create index if not exists license_operations_machine_idx on license_operations (machine_id)`),
        runQuery(`create index if not exists license_operations_operation_idx on license_operations (operation)`),
      ]);
    });
    if (executor === query) schemaPromise = promise;
    return promise;
  }
  return schemaPromise;
}

export function requestIp(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || request?.headers?.get?.('x-real-ip') || null;
}

function safeDetails(value) {
  const details = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sanitized = {};
  for (const [key, item] of Object.entries(details)) {
    if (/password|secret|token|authorization/i.test(key)) continue;
    sanitized[key] = item;
  }
  const encoded = JSON.stringify(sanitized);
  if (Buffer.byteLength(encoded, 'utf8') <= MAX_DETAILS_BYTES) return sanitized;
  return { truncated: true, summary: encoded.slice(0, MAX_DETAILS_BYTES) };
}

export async function logLicenseOperation({
  operation,
  outcome = 'success',
  source = 'server',
  license = null,
  licenseKey = '',
  machineId = '',
  previousMachineId = '',
  statusBefore = '',
  statusAfter = '',
  request = null,
  appVersion = '',
  details = {},
  executor = query,
} = {}) {
  const runQuery = typeof executor === 'function' ? executor : executor.query.bind(executor);
  await ensureLicenseOperationsTable(executor);
  await runQuery(
    `insert into license_operations (
       operation, outcome, source, license_id, license_key, machine_id, previous_machine_id,
       status_before, status_after, ip, app_version, details
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
    [
      String(operation || 'unknown'),
      String(outcome || 'unknown'),
      String(source || 'server'),
      license?.id || null,
      license?.license_key || String(licenseKey || '') || null,
      String(machineId || '') || null,
      String(previousMachineId || '') || null,
      String(statusBefore || license?.status || '') || null,
      String(statusAfter || '') || null,
      requestIp(request),
      String(appVersion || '') || null,
      JSON.stringify(safeDetails(details)),
    ],
  );
}
