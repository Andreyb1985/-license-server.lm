'use client';

import { useEffect, useMemo, useState } from 'react';

const ACTIVE_STATUSES = new Set(['trialing', 'active', 'expiring_soon']);
const PROBLEM_STATUSES = new Set(['past_due', 'unpaid', 'expired', 'refunded', 'disputed', 'revoked', 'invalid', 'no_connection']);
const STATUS_OPTIONS = [
  'trialing',
  'active',
  'expiring_soon',
  'past_due',
  'unpaid',
  'canceled',
  'expired',
  'refunded',
  'disputed',
  'revoked',
  'invalid',
  'no_connection',
];
const TYPE_OPTIONS = ['trial', 'subscription', 'lifetime', 'demo', 'internal'];

function text(value, fallback = '-') {
  const stringValue = String(value || '').trim();
  return stringValue || fallback;
}

function maskLicenseKey(licenseKey) {
  if (!licenseKey) return '';
  const value = String(licenseKey);
  return `${value.slice(0, 8)}-....-${value.slice(-4)}`;
}

function dateValue(value) {
  if (!value) return '';
  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function fmtDate(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Berlin',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function effectiveTrialEnd(license) {
  return license?.trial_ends_at || license?.related_trial_ends_at || null;
}

function addCalendarMonths(value, months) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const day = date.getUTCDate();
  const result = new Date(date);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const daysInTargetMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, daysInTargetMonth));
  return result.toISOString();
}

function hasActiveTrialWindow(license) {
  const value = effectiveTrialEnd(license);
  return value && new Date(value).getTime() > Date.now();
}

function licenseAccessEndsAt(license) {
  if (!license) return null;
  if (license.access_ends_at) return license.access_ends_at;
  const trialEndValue = effectiveTrialEnd(license);
  const trialEnd = trialEndValue ? new Date(trialEndValue) : null;
  const periodEnd = license.current_period_end ? new Date(license.current_period_end) : null;
  const hasFutureTrial = trialEnd && Number.isFinite(trialEnd.getTime()) && trialEnd > new Date();
  const hasPeriodEnd = periodEnd && Number.isFinite(periodEnd.getTime());
  const status = String(license.status || '').toLowerCase();
  const hasStripeSubscription = Boolean(license.stripe_subscription_id);
  const hasPaidSubscription = ['active', 'expiring_soon'].includes(status) || (status === 'trialing' && hasStripeSubscription);

  if (license.type === 'subscription' && hasFutureTrial && hasPaidSubscription) {
    const trialPlusPaidMonth = addCalendarMonths(trialEnd.toISOString(), 1);
    if (!hasPeriodEnd) return trialPlusPaidMonth;
    const trialPlusPaidDate = trialPlusPaidMonth ? new Date(trialPlusPaidMonth) : null;
    if (trialPlusPaidDate && Number.isFinite(trialPlusPaidDate.getTime()) && trialPlusPaidDate > periodEnd) {
      return trialPlusPaidDate.toISOString();
    }
    return periodEnd.toISOString();
  }

  return (hasPeriodEnd && periodEnd.toISOString()) || (hasFutureTrial && trialEnd.toISOString()) || null;
}

function trialSourceLabel(license) {
  if (!license?.related_trial_license_key) return '';
  return `aus ${maskLicenseKey(license.related_trial_license_key)}`;
}

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (ACTIVE_STATUSES.has(value)) return 'ok';
  if (PROBLEM_STATUSES.has(value)) return 'bad';
  return 'warn';
}

function stripeBase(stripeMode) {
  return stripeMode === 'test' ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com';
}

function StripeLink({ id, type, children, stripeMode }) {
  if (!id) return <span>-</span>;
  const path = type === 'customer' ? `customers/${id}` : `subscriptions/${id}`;
  return <a href={`${stripeBase(stripeMode)}/${path}`} target="_blank" rel="noreferrer">{children || id}</a>;
}

function matchesFilter(license, filter) {
  const status = String(license.status || '').toLowerCase();
  if (filter === 'active') return ACTIVE_STATUSES.has(status);
  if (filter === 'problem') return PROBLEM_STATUSES.has(status);
  if (filter === 'trial') return license.type === 'trial' || status === 'trialing' || hasActiveTrialWindow(license);
  if (filter === 'stripe') return Boolean(license.stripe_subscription_id || license.stripe_customer_id);
  if (filter === 'manual') return !license.stripe_subscription_id;
  return true;
}

export default function AdminLicensesPanel({ adminSecret, licenses, stripeMode = 'live' }) {
  const [items, setItems] = useState(licenses || []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState(items[0]?.license_key || '');
  const [editing, setEditing] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const nextItems = licenses || [];
    setItems(nextItems);
    setSelectedKey((currentKey) => (
      currentKey && nextItems.some((license) => license.license_key === currentKey)
        ? currentKey
        : nextItems[0]?.license_key || ''
    ));
  }, [licenses]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((license) => {
      if (!matchesFilter(license, filter)) return false;
      if (!needle) return true;
      return [
        license.license_key,
        license.email,
        license.company_name,
        license.licensee_address,
        license.licensee_company_number,
        license.activated_machine_id,
        license.plan,
        license.status,
        license.type,
      ].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [items, query, filter]);

  const selected = visibleItems.find((license) => license.license_key === selectedKey)
    || items.find((license) => license.license_key === selectedKey)
    || visibleItems[0]
    || null;

  const counts = useMemo(() => ({
    all: items.length,
    active: items.filter((license) => matchesFilter(license, 'active')).length,
    problem: items.filter((license) => matchesFilter(license, 'problem')).length,
    trial: items.filter((license) => matchesFilter(license, 'trial')).length,
    stripe: items.filter((license) => matchesFilter(license, 'stripe')).length,
    manual: items.filter((license) => matchesFilter(license, 'manual')).length,
  }), [items]);

  const selectedTrialEnd = effectiveTrialEnd(selected);
  const selectedAccessEnd = licenseAccessEndsAt(selected);

  function replaceLicense(updated) {
    if (updated.status === 'deleted') {
      setItems((current) => current.filter((license) => license.license_key !== updated.license_key));
      setSelectedKey('');
      setEditing(false);
      return;
    }
    setItems((current) => current.map((license) => (
      license.license_key === updated.license_key ? { ...license, ...updated } : license
    )));
    setSelectedKey(updated.license_key);
  }

  async function callAdminApi(path, payload) {
    setError('');
    setMessage('');
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'Admin action failed.');
    return data;
  }

  async function saveLicense(event) {
    event.preventDefault();
    if (!selected) return;
    setBusyAction('save');
    try {
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(form.entries());
      payload.license_key = selected.license_key;
      const data = await callAdminApi('/api/admin/licenses/update', payload);
      replaceLicense(data);
      setEditing(false);
      setMessage(data.message || 'License updated.');
    } catch (err) {
      setError(err.message || 'License could not be saved.');
    } finally {
      setBusyAction('');
    }
  }

  async function runAction(action) {
    if (!selected) return;
    const labels = {
      release_machine: 'Computer-ID wirklich loesen?',
      revoke: 'Lizenz wirklich widerrufen?',
      reactivate: 'Lizenz wirklich reaktivieren?',
      delete: 'Lizenz wirklich dauerhaft loeschen? Das geht nur fuer manuelle/test Lizenzen.',
    };
    if (!window.confirm(labels[action] || 'Aktion ausfuehren?')) return;

    setBusyAction(action);
    try {
      const data = await callAdminApi('/api/admin/licenses/action', {
        license_key: selected.license_key,
        action,
      });
      replaceLicense(data);
      setMessage(data.message || 'Action completed.');
    } catch (err) {
      setError(err.message || 'Action failed.');
    } finally {
      setBusyAction('');
    }
  }

  async function copyKey() {
    if (!selected?.license_key) return;
    await navigator.clipboard.writeText(selected.license_key);
    setMessage('License key copied.');
  }

  return (
    <section className="panel license-manager-panel">
      <div className="panel-head">
        <div>
          <h2>Lizenzen</h2>
          <small>{visibleItems.length} von {items.length} Eintraegen</small>
        </div>
        <div className="license-tools">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Key, Firma, E-Mail, Machine-ID suchen..."
          />
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Alle ({counts.all})</option>
            <option value="active">Aktiv ({counts.active})</option>
            <option value="problem">Probleme ({counts.problem})</option>
            <option value="trial">Trial ({counts.trial})</option>
            <option value="stripe">Stripe ({counts.stripe})</option>
            <option value="manual">Manuell ({counts.manual})</option>
          </select>
        </div>
      </div>

      <div className="license-admin-grid">
        <div className="table-wrap license-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>License Key</th>
                <th>Typ</th>
                <th>Plan</th>
                <th>E-Mail</th>
                <th>Firma</th>
                <th>Machine ID</th>
                  <th>Trial bis</th>
                  <th>Lizenz bis</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.length ? visibleItems.map((license) => (
                <tr
                  key={license.license_key}
                  className={selected?.license_key === license.license_key ? 'selected-row' : ''}
                  onClick={() => {
                    setSelectedKey(license.license_key);
                    setEditing(false);
                    setError('');
                    setMessage('');
                  }}
                >
                  <td><span className={`badge ${statusClass(license.status)}`}>{text(license.status)}</span></td>
                  <td><code>{maskLicenseKey(license.license_key)}</code></td>
                  <td>{text(license.type)}</td>
                  <td>{text(license.plan)}</td>
                  <td>{text(license.email)}</td>
                  <td>{text(license.company_name)}</td>
                  <td><code>{text(license.activated_machine_id)}</code></td>
                  <td>{hasActiveTrialWindow(license) ? (
                    <span className="trial-pill">{fmtDate(effectiveTrialEnd(license))}</span>
                  ) : '-'}</td>
                  <td><strong>{fmtDate(licenseAccessEndsAt(license))}</strong></td>
                </tr>
              )) : (
                <tr><td colSpan="9" className="empty">Keine passenden Lizenzen.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="license-detail">
          {selected ? (
            <>
              <div className="detail-head">
                <div>
                  <small>Ausgewaehlte Lizenz</small>
                  <h3>{maskLicenseKey(selected.license_key)}</h3>
                </div>
                <span className={`badge ${statusClass(selected.status)}`}>{text(selected.status)}</span>
              </div>
              {hasActiveTrialWindow(selected) ? (
                <div className="trial-banner">
                  Probezeit aktiv bis <strong>{fmtDate(selectedTrialEnd)}</strong>
                  {trialSourceLabel(selected) ? <span>{trialSourceLabel(selected)}</span> : null}
                  <span>Lizenz gueltig bis {fmtDate(selectedAccessEnd)} inkl. bezahltem Monat.</span>
                </div>
              ) : null}

              {editing ? (
                <form className="edit-license-form" onSubmit={saveLicense}>
                  <label>
                    Firma
                    <input name="company_name" defaultValue={selected.company_name || ''} />
                  </label>
                  <label>
                    E-Mail
                    <input name="email" type="email" defaultValue={selected.email || ''} />
                  </label>
                  <label>
                    Unternehmensnummer
                    <input name="licensee_company_number" defaultValue={selected.licensee_company_number || ''} />
                  </label>
                  <label>
                    Typ
                    <select name="type" defaultValue={selected.type || 'subscription'}>
                      {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>
                    Status
                    <select name="status" defaultValue={selected.status || 'active'}>
                      {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                  <label>
                    Plan
                    <input name="plan" defaultValue={selected.plan || ''} />
                  </label>
                  <label>
                    Seats
                    <input name="seats" type="number" min="1" max="999" defaultValue={selected.seats || 1} />
                  </label>
                  <label>
                    Computer-ID
                    <input name="activated_machine_id" defaultValue={selected.activated_machine_id || ''} />
                  </label>
                  <label>
                    Trial bis
                    <input name="trial_ends_at" type="date" defaultValue={dateValue(selected.trial_ends_at)} />
                  </label>
                  <label>
                    Periode bis
                    <input name="current_period_end" type="date" defaultValue={dateValue(selected.current_period_end)} />
                  </label>
                  <label className="wide">
                    Anschrift
                    <input name="licensee_address" defaultValue={selected.licensee_address || ''} />
                  </label>
                  <label className="wide">
                    Notiz
                    <textarea name="note" rows="4" defaultValue={selected.note || ''} />
                  </label>
                  <div className="detail-actions">
                    <button type="submit" disabled={busyAction === 'save'}>{busyAction === 'save' ? 'Speichert...' : 'Speichern'}</button>
                    <button type="button" className="ghost-button" onClick={() => setEditing(false)}>Abbrechen</button>
                  </div>
                </form>
              ) : (
                <>
                  <dl className="license-facts">
                    <div><dt>License Key</dt><dd><code>{selected.license_key}</code></dd></div>
                    <div><dt>Firma</dt><dd>{text(selected.company_name)}</dd></div>
                    <div><dt>E-Mail</dt><dd>{text(selected.email)}</dd></div>
                    <div><dt>Anschrift</dt><dd>{text(selected.licensee_address)}</dd></div>
                    <div><dt>Unternehmensnr.</dt><dd>{text(selected.licensee_company_number)}</dd></div>
                    <div><dt>Typ / Plan</dt><dd>{text(selected.type)} / {text(selected.plan)}</dd></div>
                    <div><dt>Seats</dt><dd>{selected.seats || 1}</dd></div>
                    <div><dt>Computer-ID</dt><dd><code>{text(selected.activated_machine_id)}</code></dd></div>
                    <div><dt>Stripe Kunde</dt><dd><StripeLink id={selected.stripe_customer_id} type="customer" stripeMode={stripeMode}>{text(selected.stripe_customer_id)}</StripeLink></dd></div>
                    <div><dt>Subscription</dt><dd><StripeLink id={selected.stripe_subscription_id} type="subscription" stripeMode={stripeMode}>{text(selected.stripe_subscription_id)}</StripeLink></dd></div>
                    <div><dt>Probezeit</dt><dd>{selectedTrialEnd ? `${fmtDate(selectedTrialEnd)} ${trialSourceLabel(selected)}`.trim() : '-'}</dd></div>
                    <div><dt>Stripe Periode</dt><dd>{fmtDate(selected.current_period_end)}</dd></div>
                    <div><dt>Lizenz gültig bis</dt><dd>{fmtDate(selectedAccessEnd)}</dd></div>
                    <div><dt>Letzte Pruefung</dt><dd>{fmtDate(selected.last_check_at)}</dd></div>
                    <div><dt>Erstellt</dt><dd>{fmtDate(selected.created_at)}</dd></div>
                  </dl>
                  {selected.note ? <pre className="license-note">{selected.note}</pre> : null}
                  <div className="detail-actions">
                    <button type="button" onClick={() => setEditing(true)}>Bearbeiten</button>
                    <button type="button" className="ghost-button" onClick={copyKey}>Key kopieren</button>
                    <button type="button" className="ghost-button" disabled={!selected.activated_machine_id || !!busyAction} onClick={() => runAction('release_machine')}>Computer loesen</button>
                    <button type="button" className="ghost-button" disabled={!!busyAction} onClick={() => runAction('reactivate')}>Reaktivieren</button>
                    <button type="button" className="danger-button" disabled={!!busyAction} onClick={() => runAction('revoke')}>Widerrufen</button>
                    <button type="button" className="danger-button soft" disabled={!!busyAction || !!selected.stripe_subscription_id} onClick={() => runAction('delete')}>Loeschen</button>
                  </div>
                </>
              )}

              {message ? <div className="form-message ok compact">{message}</div> : null}
              {error ? <div className="form-message bad compact">{error}</div> : null}
            </>
          ) : (
            <div className="empty-detail">Keine Lizenz ausgewaehlt.</div>
          )}
        </aside>
      </div>
    </section>
  );
}
