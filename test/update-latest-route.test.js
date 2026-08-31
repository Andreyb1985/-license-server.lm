import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { GET } from "../app/api/updates/windows/latest/route.js";

test("production Windows channel publishes the approved 2.0.2 test release", async () => {
  const response = await GET(new Request("https://license-server-lm.vercel.app/api/updates/windows/latest"));
  const manifest = await response.json();

  assert.equal(manifest.available, true);
  assert.equal(manifest.version, "2.0.2");
  assert.equal(manifest.build, "2026.08.31.2");
  assert.equal(manifest.test_mode, true);

  const archiveName = path.basename(new URL(manifest.download_url).pathname);
  const archive = await readFile(path.join(process.cwd(), "public", "downloads", archiveName));
  assert.equal(archive.length, manifest.size);
  assert.equal(createHash("sha256").update(archive).digest("hex"), manifest.sha256);
});
