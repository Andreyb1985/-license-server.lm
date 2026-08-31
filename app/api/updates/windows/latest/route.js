import { buildWindowsUpdateManifest } from "../../../../../lib/update-manifest.js";

export const dynamic = "force-dynamic";

const WINDOWS_2_0_2_TEST_RELEASE = {
  available: true,
  platform: "windows",
  version: "2.0.2",
  build: "2026.08.31.1",
  sha256: "c61e8bb05a1d417b95fcf3739a8671b3acac936ddbd2798238457ba408b3175c",
  size: 1720112,
  release_notes: [
    "Neuer integrierter Update-Ablauf im LohnMail-Design",
    "Download-Fortschritt und verständliche Bestätigungen",
    "SQLite-Integritätsprüfung vor und nach der Installation",
    "Sicherung, Selbsttest und automatischer Rollback bei Installationsfehlern",
    "Einstellungen, Unternehmen und Berichte bleiben unverändert",
  ],
  published_at: "2026-08-31T16:09:22+02:00",
  required: false,
  required_reason: null,
  test_mode: true,
};

export async function GET(request) {
  try {
    const configuredManifest = buildWindowsUpdateManifest();
    const manifest = configuredManifest.available
      ? configuredManifest
      : {
          ...WINDOWS_2_0_2_TEST_RELEASE,
          download_url: `${new URL(request.url).origin}/downloads/LohnMail-2.0.2-test-update.zip`,
        };
    return Response.json(manifest, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Windows update manifest is invalid", error);
    return Response.json(
      {
        available: false,
        platform: "windows",
        message: "Update service is temporarily unavailable.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
