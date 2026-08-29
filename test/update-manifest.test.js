import assert from "node:assert/strict";
import test from "node:test";

import { buildWindowsUpdateManifest } from "../lib/update-manifest.js";

const validEnvironment = {
  WINDOWS_UPDATE_VERSION: "2.1.0",
  WINDOWS_UPDATE_BUILD: "2026.08.23",
  WINDOWS_UPDATE_URL: "https://downloads.lohn-mail.de/LohnMail-2.1.0.exe",
  WINDOWS_UPDATE_SHA256: "a".repeat(64),
  WINDOWS_UPDATE_SIZE: "1048576",
  WINDOWS_UPDATE_RELEASE_NOTES: '["Fehlerkorrekturen", "Stabilitaet verbessert"]',
  WINDOWS_UPDATE_PUBLISHED_AT: "2026-08-23T10:00:00Z",
};

test("returns an unavailable manifest when no release is configured", () => {
  assert.deepEqual(buildWindowsUpdateManifest({}), {
    available: false,
    platform: "windows",
  });
});

test("builds a complete optional Windows update manifest", () => {
  const manifest = buildWindowsUpdateManifest(validEnvironment);

  assert.equal(manifest.available, true);
  assert.equal(manifest.version, "2.1.0");
  assert.equal(manifest.size, 1048576);
  assert.equal(manifest.required, false);
  assert.equal(manifest.required_reason, null);
  assert.deepEqual(manifest.release_notes, ["Fehlerkorrekturen", "Stabilitaet verbessert"]);
});

test("allows ZIP releases only in explicit test mode", () => {
  const manifest = buildWindowsUpdateManifest({
    ...validEnvironment,
    WINDOWS_UPDATE_URL: "https://downloads.lohn-mail.de/LohnMail-2.0.1-test.zip",
    WINDOWS_UPDATE_TEST_MODE: "true",
  });
  assert.equal(manifest.test_mode, true);
  assert.match(manifest.download_url, /\.zip$/);
});

test("rejects ZIP releases outside test mode", () => {
  assert.throws(
    () => buildWindowsUpdateManifest({
      ...validEnvironment,
      WINDOWS_UPDATE_URL: "https://downloads.lohn-mail.de/LohnMail-2.0.1.zip",
    }),
    /EXE or MSI installer/,
  );
});

test("allows mandatory updates only for supported critical reasons", () => {
  const manifest = buildWindowsUpdateManifest({
    ...validEnvironment,
    WINDOWS_UPDATE_REQUIRED: "true",
    WINDOWS_UPDATE_REQUIRED_REASON: "security",
  });

  assert.equal(manifest.required, true);
  assert.equal(manifest.required_reason, "security");
  assert.throws(
    () =>
      buildWindowsUpdateManifest({
        ...validEnvironment,
        WINDOWS_UPDATE_REQUIRED: "true",
        WINDOWS_UPDATE_REQUIRED_REASON: "feature",
      }),
    /must be one of/,
  );
});

test("rejects partial or unsafe release configuration", () => {
  assert.throws(
    () => buildWindowsUpdateManifest({ WINDOWS_UPDATE_VERSION: "2.1.0" }),
    /Incomplete Windows update manifest/,
  );
  assert.throws(
    () =>
      buildWindowsUpdateManifest({
        ...validEnvironment,
        WINDOWS_UPDATE_URL: "http://downloads.lohn-mail.de/LohnMail-2.1.0.exe",
      }),
    /must use HTTPS/,
  );
  assert.throws(
    () => buildWindowsUpdateManifest({ ...validEnvironment, WINDOWS_UPDATE_SHA256: "broken" }),
    /64 hexadecimal/,
  );
});
