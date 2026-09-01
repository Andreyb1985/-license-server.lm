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
      build: "2026.09.01.3",
      download_url: `${origin}/downloads/LohnMail-2.0.3-build-2026.09.01.3-exe-update.zip`,
      sha256: "d71fdf6faf46d75aaa7ec27ee9935738b5ff00c1bd8192383554130c71bfe271",
      size: 41960034,
      release_notes: [
        "Vollständiger Windows-EXE-Build für LohnMail 2.0.3",
        "Windows-Build und Update-Paket werden automatisch auf Windows x64 geprüft",
        "System Informationen wurden aus den Einstellungen entfernt",
        "Der Update-Ablauf nutzt den freien Bereich rechts auf breiten Fenstern",
        "Auf schmalen Fenstern bleibt die Update-Seite vollständig responsiv",
        "Updater läuft außerhalb des App-Ordners und wartet auf das vollständige Beenden der Anwendung",
        "Sichere ZIP-Prüfung und Extraktion ohne Windows-Explorer oder Expand-Archive",
        "WAL-kompatible SQLite-Integritätsprüfung vor und nach dem Update",
        "Das Update ersetzt ausschließlich den Programmordner App",
        "Settings, Unternehmen, Lizenzdaten und Berichte bleiben unverändert",
        "Sicherung, Selbsttest und automatischer Rollback bleiben aktiv",
      ],
      published_at: "2026-09-01T22:52:06+02:00",
      required: false,
      required_reason: null,
      test_mode: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
