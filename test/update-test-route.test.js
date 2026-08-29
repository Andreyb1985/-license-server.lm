import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../app/api/updates/windows/test/route.js";

test("isolated Windows test channel publishes the ZIP test release", async () => {
  const response = await GET(new Request("https://license-server-lm.vercel.app/api/updates/windows/test"));
  const manifest = await response.json();
  assert.equal(manifest.test_mode, true);
  assert.equal(manifest.version, "2.0.1");
  assert.match(manifest.download_url, /^https:\/\/license-server-lm\.vercel\.app\/downloads\/.+\.zip$/);
  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  assert.ok(manifest.size > 0);
});
