const REQUIRED_WINDOWS_UPDATE_FIELDS = [
  ["WINDOWS_UPDATE_VERSION", "version"],
  ["WINDOWS_UPDATE_BUILD", "build"],
  ["WINDOWS_UPDATE_URL", "download_url"],
  ["WINDOWS_UPDATE_SHA256", "sha256"],
  ["WINDOWS_UPDATE_SIZE", "size"],
];

const REQUIRED_REASONS = new Set([
  "security",
  "critical_security",
  "incompatible",
  "critical_incompatibility",
]);

function envValue(env, key) {
  return String(env[key] || "").trim();
}

function parseReleaseNotes(raw) {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Plain multiline values are convenient in Vercel environment variables.
  }

  return raw
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildWindowsUpdateManifest(env = process.env) {
  const configured = REQUIRED_WINDOWS_UPDATE_FIELDS.filter(([key]) => envValue(env, key));
  if (configured.length === 0) {
    return { available: false, platform: "windows" };
  }

  const missing = REQUIRED_WINDOWS_UPDATE_FIELDS
    .filter(([key]) => !envValue(env, key))
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Incomplete Windows update manifest: ${missing.join(", ")}`);
  }

  const downloadUrl = envValue(env, "WINDOWS_UPDATE_URL");
  const testMode = envValue(env, "WINDOWS_UPDATE_TEST_MODE").toLowerCase() === "true";
  let parsedUrl;
  try {
    parsedUrl = new URL(downloadUrl);
  } catch {
    throw new Error("WINDOWS_UPDATE_URL must be a valid URL");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("WINDOWS_UPDATE_URL must use HTTPS");
  }
  const allowedPattern = testMode ? /\.(exe|msi|zip)$/i : /\.(exe|msi)$/i;
  if (!allowedPattern.test(parsedUrl.pathname)) {
    throw new Error(testMode
      ? "WINDOWS_UPDATE_URL must point to an EXE, MSI, or test ZIP"
      : "WINDOWS_UPDATE_URL must point to an EXE or MSI installer");
  }

  const sha256 = envValue(env, "WINDOWS_UPDATE_SHA256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("WINDOWS_UPDATE_SHA256 must contain 64 hexadecimal characters");
  }

  const size = Number(envValue(env, "WINDOWS_UPDATE_SIZE"));
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("WINDOWS_UPDATE_SIZE must be a positive integer");
  }

  const required = envValue(env, "WINDOWS_UPDATE_REQUIRED").toLowerCase() === "true";
  const requiredReason = envValue(env, "WINDOWS_UPDATE_REQUIRED_REASON").toLowerCase();
  if (required && !REQUIRED_REASONS.has(requiredReason)) {
    throw new Error(
      `WINDOWS_UPDATE_REQUIRED_REASON must be one of: ${Array.from(REQUIRED_REASONS).join(", ")}`,
    );
  }

  return {
    available: true,
    platform: "windows",
    version: envValue(env, "WINDOWS_UPDATE_VERSION"),
    build: envValue(env, "WINDOWS_UPDATE_BUILD"),
    download_url: downloadUrl,
    sha256,
    size,
    release_notes: parseReleaseNotes(envValue(env, "WINDOWS_UPDATE_RELEASE_NOTES")),
    published_at: envValue(env, "WINDOWS_UPDATE_PUBLISHED_AT") || null,
    required,
    required_reason: required ? requiredReason : null,
    test_mode: testMode,
  };
}
