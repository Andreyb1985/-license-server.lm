function getInstallerUrl() {
  const value = String(process.env.LOHNMAIL_INSTALLER_URL || '').trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function unavailablePage() {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LohnMail Download</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, sans-serif; }
      body { margin: 0; background: #f4f8f7; color: #102033; }
      main { max-width: 640px; margin: 12vh auto; padding: 40px; background: #fff; border: 1px solid #dce8e4; border-radius: 8px; }
      h1 { margin-top: 0; }
      a { color: #008357; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>Download noch nicht verfügbar</h1>
      <p>Der signierte LohnMail-Installer wurde auf diesem Server noch nicht hinterlegt.</p>
      <p>Bitte wenden Sie sich an <a href="mailto:support@lohn-mail.de">support@lohn-mail.de</a>.</p>
    </main>
  </body>
</html>`;
}

export async function GET() {
  const installerUrl = getInstallerUrl();
  if (!installerUrl) {
    return new Response(unavailablePage(), {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  return new Response(null, {
    status: 307,
    headers: {
      'Cache-Control': 'no-store',
      Location: installerUrl,
    },
  });
}
