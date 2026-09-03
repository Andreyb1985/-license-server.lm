import { buildWindowsUpdateManifest } from "../../../../../lib/update-manifest.js";

export const dynamic = "force-dynamic";

const WINDOWS_2_0_3_TEST_RELEASE = {
  available: true,
  platform: "windows",
  version: "2.0.3",
  build: "2026.09.03.1",
  sha256: "14b71918105f528227b654a35845d5241ed9142a1c51afe4e8c10a16340e5d1a",
  size: 42165434,
  release_notes: [
    "Vollständiger Windows-EXE-Build für LohnMail 2.0.3",
    "Windows-Build und Update-Paket werden automatisch auf Windows x64 geprüft",
    "Verbesserte responsive Darstellung der Verarbeitung auf kleinen Fenstern",
    "Verarbeitungsstatus und Schnellaktionen nutzen den freien Seitenbereich",
    "Dateipfade bleiben sichtbar und zeigen weiterhin den relevanten Pfadteil",
    "Massennachrichten können jetzt mit einem Dateianhang versendet werden",
    "Besser erkennbare LohnMail-Symbole unter Windows",
    "Updater läuft außerhalb des App-Ordners und wartet auf das vollständige Beenden der Anwendung",
    "Sichere ZIP-Prüfung und Extraktion ohne Windows-Explorer oder Expand-Archive",
    "WAL-kompatible SQLite-Integritätsprüfung vor und nach dem Update",
    "Das Update ersetzt ausschließlich den Programmordner App",
    "Settings, Unternehmen, Lizenzdaten und Berichte bleiben unverändert",
    "Sicherung, Selbsttest und automatischer Rollback bleiben aktiv",
  ],
  published_at: "2026-09-03T00:00:00+02:00",
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
          ...WINDOWS_2_0_3_TEST_RELEASE,
          download_url: `${new URL(request.url).origin}/downloads/LohnMail-2.0.3-build-2026.09.03.1-exe-update.zip`,
        };
    return Response.json(manifest, {
      headers: {
        "Cache-Control": "no-store",
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
