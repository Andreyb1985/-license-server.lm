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
      build: "2026.08.31.3",
      download_url: `${origin}/downloads/LohnMail-2.0.3-build-2026.08.31.3-test-update.zip`,
      sha256: "b43841134e5bf2a5a5f73c51bfaba26e08b9d001710e72321d3d96a642aa8748",
      size: 1715660,
      release_notes: [
        "Test-Update von LohnMail 2.0.2 auf Version 2.0.3",
        "Updater läuft außerhalb des App-Ordners und wartet auf das vollständige Beenden der Anwendung",
        "Sichere ZIP-Prüfung und Extraktion ohne Windows-Explorer oder Expand-Archive",
        "WAL-kompatible SQLite-Integritätsprüfung vor und nach dem Update",
        "Das Update ersetzt ausschließlich den Programmordner App",
        "Settings, Unternehmen, Lizenzdaten und Berichte bleiben unverändert",
        "Sicherung, Selbsttest und automatischer Rollback bleiben aktiv",
        "Das Dashboard zeigt nach dem Neustart die installierte Testversion an",
        "Optimierte Darstellung der Update-Schaltfläche bei kleineren Windows-Auflösungen",
      ],
      published_at: "2026-08-31T23:14:05+02:00",
      required: false,
      required_reason: null,
      test_mode: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
