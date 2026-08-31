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
      build: "2026.08.31.1",
      download_url: `${origin}/downloads/LohnMail-2.0.3-build-2026.08.31.1-test-update.zip`,
      sha256: "9dca33579f2f05da05b4f54d7bda895058f0235c2ec18c7703c13de3aa40d801",
      size: 1718489,
      release_notes: [
        "Test-Update von LohnMail 2.0.2 auf Version 2.0.3",
        "WAL-kompatible SQLite-Integritätsprüfung ohne falsche Nur-Lesen-Blockierung",
        "Das Update ersetzt ausschließlich den Programmordner App",
        "Settings, Unternehmen, Lizenzdaten und Berichte bleiben unverändert",
        "Sicherung, Selbsttest und automatischer Rollback bleiben aktiv",
        "Das Dashboard zeigt nach dem Neustart die installierte Testversion an",
      ],
      published_at: "2026-08-31T21:18:23+02:00",
      required: false,
      required_reason: null,
      test_mode: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
