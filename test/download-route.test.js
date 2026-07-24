import assert from 'node:assert/strict';
import test from 'node:test';

import { GET } from '../app/api/download/route.js';

test('download route uses the configured installer URL', async () => {
  const previous = process.env.LOHNMAIL_INSTALLER_URL;

  try {
    process.env.LOHNMAIL_INSTALLER_URL = 'https://downloads.example.com/LohnMail.dmg';
    const redirect = await GET();

    assert.equal(redirect.status, 307);
    assert.equal(redirect.headers.get('location'), 'https://downloads.example.com/LohnMail.dmg');

    delete process.env.LOHNMAIL_INSTALLER_URL;
    const unavailable = await GET();

    assert.equal(unavailable.status, 503);
    assert.match(await unavailable.text(), /Download noch nicht verfügbar/);

    process.env.LOHNMAIL_INSTALLER_URL = 'http://downloads.example.com/LohnMail.dmg';
    const insecure = await GET();

    assert.equal(insecure.status, 503);
  } finally {
    if (previous === undefined) {
      delete process.env.LOHNMAIL_INSTALLER_URL;
    } else {
      process.env.LOHNMAIL_INSTALLER_URL = previous;
    }
  }
});
