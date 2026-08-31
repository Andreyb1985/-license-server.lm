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
      build: "2026.08.31.2",
      download_url: `${origin}/downloads/LohnMail-2.0.2-build-2026.08.31.2-test-update.zip`,
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
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
