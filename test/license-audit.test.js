import assert from 'node:assert/strict';
import test from 'node:test';

import { logLicenseOperation, requestIp } from '../lib/license-audit.js';

test('requestIp uses the first forwarded address', () => {
  const request = { headers: { get: (name) => name === 'x-forwarded-for' ? '203.0.113.4, 10.0.0.1' : '' } };
  assert.equal(requestIp(request), '203.0.113.4');
});

test('license audit stores trace data and removes secret fields', async () => {
  const calls = [];
  const executor = async (sql, params = []) => {
    calls.push({ sql, params });
    return { rows: [] };
  };

  await logLicenseOperation({
    operation: 'trial.create',
    outcome: 'created',
    source: 'desktop',
    license: { id: 'license-id', license_key: 'LM-TRIAL-TEST', status: 'trialing' },
    machineId: 'machine-a',
    statusAfter: 'trialing',
    appVersion: '2.0.0',
    details: { reason: 'first start', password: 'must-not-be-stored', auth_token: 'hidden' },
    executor,
  });

  const insert = calls.find((call) => call.sql.includes('insert into license_operations'));
  assert.ok(insert);
  const details = JSON.parse(insert.params.at(-1));
  assert.deepEqual(details, { reason: 'first start' });
  assert.equal(insert.params[4], 'LM-TRIAL-TEST');
  assert.equal(insert.params[5], 'machine-a');
});
