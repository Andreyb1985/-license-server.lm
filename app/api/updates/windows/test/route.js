export const dynamic = "force-dynamic";

// Isolated unsigned ZIP channel. Production clients do not use this endpoint,
// and only desktop builds compiled with TEST_UPDATES_ENABLED accept its ZIP.
export async function GET(request) {
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      available: true,
      platform: "windows",
      version: "2.0.1",
      build: "2026.08.29.1",
      download_url: `${origin}/downloads/LohnMail-2.0.1-test-update.zip`,
      sha256: "318a7601ae9cba2387d28d187608707ce91b0038f1212de025f5cc425745caf2",
      size: 1723845,
      release_notes: [
        "Test des integrierten ZIP-Updaters",
        "Verständliche Meldungen bei E-Mail-Fehlern",
        "Bestätigung des erfolgreichen Updates auf dem Dashboard",
        "Sicherung, Selbsttest und automatischer Rollback bei Installationsfehlern",
      ],
      published_at: "2026-08-29T20:30:00+02:00",
      required: false,
      required_reason: null,
      test_mode: true,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
