import { buildWindowsUpdateManifest } from "../../../../../lib/update-manifest.js";

export const dynamic = "force-dynamic";

const WINDOWS_2_0_2_TEST_RELEASE = {
  available: true,
  platform: "windows",
  version: "2.0.2",
  build: "2026.08.31.2",
  sha256: "0669248479d280cf40da91222c53f1cd7f9159a1cd4aebc7a5f1a6b92dd5831b",
  size: 1720629,
  release_notes: [
    "Neuer integrierter Update-Ablauf im LohnMail-Design",
    "Download-Fortschritt und verständliche Bestätigungen",
    "SQLite-Integritätsprüfung vor und nach der Installation",
    "Sicherung, Selbsttest und automatischer Rollback bei Installationsfehlern",
    "Einstellungen, Unternehmen und Berichte bleiben unverändert",
    "Einheitliche Update-Seite mit einem geführten Aktionsknopf",
    "Verständliche Meldungen bei Netzwerk-, SQLite- und Rollback-Fehlern",
  ],
  published_at: "2026-08-31T16:58:11+02:00",
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
          download_url: `${new URL(request.url).origin}/downloads/LohnMail-2.0.2-build-2026.08.31.2-test-update.zip`,
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
