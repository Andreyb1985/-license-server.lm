export const dynamic = "force-dynamic";

// Isolated unsigned ZIP channel. Production clients do not use this endpoint,
// and only desktop builds compiled with TEST_UPDATES_ENABLED accept its ZIP.
export async function GET(request) {
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      available: true,
      platform: "windows",
      version: "2.0.3",
      build: "2026.09.03.1",
      download_url: `${origin}/downloads/LohnMail-2.0.3-build-2026.09.03.1-exe-update.zip`,
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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
