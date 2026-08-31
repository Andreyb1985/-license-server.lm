export const dynamic = "force-dynamic";

// Isolated unsigned ZIP channel. Production clients do not use this endpoint,
// and only desktop builds compiled with TEST_UPDATES_ENABLED accept its ZIP.
export async function GET(request) {
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      available: true,
      platform: "windows",
      version: "2.0.2",
      build: "2026.08.31.1",
      download_url: `${origin}/downloads/LohnMail-2.0.2-test-update.zip`,
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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
