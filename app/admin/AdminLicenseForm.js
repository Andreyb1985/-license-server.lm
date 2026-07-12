'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLicenseForm({ adminSecret }) {
  const router = useRouter();
  const [licenseType, setLicenseType] = useState('lifetime');
  const [busy, setBusy] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [trialResult, setTrialResult] = useState(null);
  const [trialError, setTrialError] = useState('');

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultTrialEnd = useMemo(() => {
    const value = new Date(Date.now() + 60 * 86400000);
    return value.toISOString().slice(0, 10);
  }, []);

  async function createLicense(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError('');
    setResult(null);

    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    if (payload.type !== 'demo' && payload.type !== 'trial') payload.expires_at = '';

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
      formElement.reset();
      setLicenseType('lifetime');
      router.refresh();
    } catch (err) {
      setError(err.message || 'Lizenz konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function updateTrial(event) {
    event.preventDefault();
    const submitter = event.nativeEvent.submitter;
    const action = submitter?.value || 'set';
    setTrialBusy(true);
    setTrialError('');
    setTrialResult(null);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.action = action;
    if (action === 'cancel') payload.trial_ends_at = '';

    try {
      const response = await fetch('/api/admin/licenses/trial', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || 'Trial konnte nicht aktualisiert werden.');
      setTrialResult(data);
    } catch (err) {
      setTrialError(err.message || 'Trial konnte nicht aktualisiert werden.');
    } finally {
      setTrialBusy(false);
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
          Unternehmensnummer
          <input name="licensee_company_number" placeholder="Steuer-/HR-/USt-ID" />
        </label>
        <label>
          Lizenztyp
          <select name="type" value={licenseType} onChange={(event) => setLicenseType(event.target.value)}>
            <option value="trial">Trial</option>
            <option value="lifetime">Lifetime</option>
            <option value="demo">Demo</option>
            <option value="internal">Internal</option>
          </select>
        </label>
        <label>
          Plan
          <input name="plan" placeholder={licenseType === 'trial' ? 'Trial' : licenseType === 'internal' ? 'Internal' : licenseType === 'demo' ? 'Demo' : 'Professional'} />
        </label>
        <label>
          Seats
          <input name="seats" type="number" min="1" max="999" defaultValue="1" />
        </label>
        <label>
          Ablaufdatum
          <input
            key={licenseType}
            name="expires_at"
            type="date"
            min={today}
            defaultValue={licenseType === 'trial' || licenseType === 'demo' ? defaultTrialEnd : ''}
            disabled={licenseType !== 'demo' && licenseType !== 'trial'}
          />
        </label>
        <label>
          Computer-ID
          <input name="machine_id" placeholder="Optional, sonst bei Aktivierung" />
        </label>
        <label className="wide">
          Anschrift
          <input name="licensee_address" placeholder="Straße, PLZ Ort, Land" />
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

      <div className="trial-admin">
        <div>
          <h3>Trial fuer bestehende Lizenz</h3>
          <p>Setzt oder beendet den Probezeitraum fuer eine vorhandene Lizenz. Bei Stripe-Subscriptions wird der Trial auch in Stripe aktualisiert.</p>
        </div>
        <form className="trial-form" onSubmit={updateTrial}>
          <label>
            Lizenzschluessel
            <input name="license_key" placeholder="LM-..." required />
          </label>
          <label>
            Trial bis
            <input name="trial_ends_at" type="date" min={today} defaultValue={defaultTrialEnd} />
          </label>
          <button type="submit" name="action" value="set" disabled={trialBusy}>Trial setzen</button>
          <button className="danger" type="submit" name="action" value="cancel" disabled={trialBusy}>Trial beenden</button>
        </form>
        {trialError ? <div className="form-message bad">{trialError}</div> : null}
        {trialResult ? (
          <div className="form-message ok">
            {trialResult.message || 'Trial aktualisiert.'} {trialResult.license_key_masked ? `(${trialResult.license_key_masked})` : ''}
          </div>
        ) : null}
      </div>
    </section>
  );
}
