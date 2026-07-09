import { json } from '../../../lib/http.js';

export async function GET() {
  return json({
    ok: true,
    message: 'Installer placeholder. Replace this route with the signed LohnMail installer download.',
    download: null,
  });
}
