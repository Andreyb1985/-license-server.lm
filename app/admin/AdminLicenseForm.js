'use client';

import { useMemo, useState } from 'react';

export default function AdminLicenseForm({ adminSecret }) {
  const [licenseType, setLicenseType] = useState('lifetime');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function createLicense(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (payload.type !== 'demo') payload.expires_at = '';

    try {
      const response = await fetch('/api/admin/licenses/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Lizenz konnte nicht erstellt werden.');
      setResult(data);
      event.currentTarget.reset();
      setLicenseType('lifetime');
    } catch (err) {
      setError(err.message || 'Lizenz konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLicenseKey() {
    if (!result?.license_key) return;
    await navigator.clipboard.writeText(result.license_key);
    setResult({ ...result, copied: true });
  }

  return (
    <section className="panel manual-license">
      <div className="panel-head">
        <div>
          <h2>Neue Lizenz erstellen</h2>
          <small>Manuelle Lizenz fuer ein neues Unternehmen generieren</small>
        </div>
      </div>

      <form className="license-form" onSubmit={createLicense}>
        <label>
          Unternehmen
          <input name="company_name" placeholder="GeSoB GmbH" required />
        </label>
        <label>
          Kontakt E-Mail
          <input name="email" type="email" placeholder="kunde@example.com" />
        </label>
        <label>
          Lizenztyp
          <select name="type" value={licenseType} onChange={(event) => setLicenseType(event.target.value)}>
            <option value="lifetime">Lifetime</option>
            <option value="demo">Demo</option>
            <option value="internal">Internal</option>
          </select>
        </label>
        <label>
          Plan
          <input name="plan" placeholder={licenseType === 'internal' ? 'Internal' : licenseType === 'demo' ? 'Demo' : 'Professional'} />
        </label>
        <label>
          Seats
          <input name="seats" type="number" min="1" max="999" defaultValue="1" />
        </label>
        <label>
          Ablaufdatum
          <input name="expires_at" type="date" min={today} disabled={licenseType !== 'demo'} />
        </label>
        <label>
          Computer-ID
          <input name="machine_id" placeholder="Optional, sonst bei Aktivierung" />
        </label>
        <label className="wide">
          Notiz
          <input name="note" placeholder="Interne Notiz, z.B. Vertrag, Ansprechpartner, Sonderfall" />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Erstelle...' : 'Lizenz generieren'}</button>
      </form>

      {error ? <div className="form-message bad">{error}</div> : null}
      {result ? (
        <div className="created-license">
          <div>
            <small>Generierter Lizenzschluessel</small>
            <code>{result.license_key}</code>
          </div>
          <button type="button" onClick={copyLicenseKey}>{result.copied ? 'Kopiert' : 'Kopieren'}</button>
        </div>
      ) : null}
    </section>
  );
}
