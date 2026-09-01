import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { GET } from "../app/api/updates/windows/test/route.js";

test("isolated Windows test channel publishes the ZIP test release", async () => {
  const response = await GET(new Request("https://license-server-lm.vercel.app/api/updates/windows/test"));
  const manifest = await response.json();
  assert.equal(manifest.test_mode, true);
  assert.equal(manifest.version, "2.0.3");
  assert.equal(manifest.build, "2026.09.01.3");
  assert.match(manifest.download_url, /^https:\/\/license-server-lm\.vercel\.app\/downloads\/.+\.zip$/);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  assert.ok(manifest.size > 0);

  const archiveName = path.basename(new URL(manifest.download_url).pathname);
  const archive = await readFile(path.join(process.cwd(), "public", "downloads", archiveName));
  assert.equal(archive.length, manifest.size);
  assert.equal(createHash("sha256").update(archive).digest("hex"), manifest.sha256);
});
