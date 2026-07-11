import { query } from '../../lib/db.js';
import { maskLicenseKey } from '../../lib/license.js';
import AdminLicenseForm from './AdminLicenseForm.js';

export const dynamic = 'force-dynamic';

const ACTIVE_STATUSES = new Set(['trialing', 'active', 'expiring_soon']);
const PROBLEM_STATUSES = new Set(['past_due', 'unpaid', 'expired', 'refunded', 'disputed', 'revoked', 'invalid', 'no_connection']);

function isAuthorized(secret) {
  return !!process.env.ADMIN_SECRET && String(secret || '') === process.env.ADMIN_SECRET;
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

function text(value, fallback = '-') {
  const stringValue = String(value || '').trim();
  return stringValue || fallback;
}

function statusClass(status) {
  const value = String(status || '').toLowerCase();
  if (ACTIVE_STATUSES.has(value)) return 'ok';
  if (PROBLEM_STATUSES.has(value)) return 'bad';
  return 'warn';
}

function stripeBase() {
  return String(process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_')
    ? 'https://dashboard.stripe.com/test'
    : 'https://dashboard.stripe.com';
}

async function loadAdminData() {
  const [licenses, customers, subscriptions, checks, duplicates] = await Promise.all([
    query(
      `select id, license_key, type, status, plan, company_name, email, seats, activated_machine_id,
              stripe_customer_id, stripe_subscription_id, trial_ends_at, current_period_end,
              last_check_at, created_by, note, revoked_at, created_at, updated_at
       from licenses
       order by created_at desc
       limit 200`,
    ),
    query(
      `select c.id, c.email, c.company_name, c.stripe_customer_id, c.created_at, c.updated_at,
              count(l.id) as license_count,
              count(l.id) filter (where l.status in ('trialing','active','expiring_soon')) as active_license_count
       from customers c
       left join licenses l on l.customer_id = c.id
       group by c.id
       order by c.created_at desc
       limit 200`,
    ),
    query(
      `select s.id, s.stripe_subscription_id, s.status, s.price_id, s.current_period_start,
              s.current_period_end, s.cancel_at_period_end, s.canceled_at, s.created_at,
              c.email, c.company_name, c.stripe_customer_id
       from subscriptions s
       left join customers c on c.id = s.customer_id
       order by s.created_at desc
       limit 200`,
    ),
    query(
      `select license_key, machine_id, status, checked_at, ip, app_version
       from license_checks
       order by checked_at desc
       limit 80`,
    ),
    query(
      `with candidates as (
         select 'machine' as kind, activated_machine_id as value, license_key, stripe_subscription_id, status
         from licenses
         where type = 'subscription'
           and status in ('trialing','active','expiring_soon','past_due','unpaid')
           and coalesce(activated_machine_id, '') <> ''
         union all
         select 'email' as kind, lower(email) as value, license_key, stripe_subscription_id, status
         from licenses
         where type = 'subscription'
           and status in ('trialing','active','expiring_soon','past_due','unpaid')
           and coalesce(email, '') <> ''
       )
       select kind, value, count(*) as count,
              string_agg(masked_key, ', ' order by masked_key) as license_keys,
              string_agg(coalesce(stripe_subscription_id, '-'), ', ' order by stripe_subscription_id) as subscriptions
       from (
         select kind, value, status, stripe_subscription_id,
                left(license_key, 8) || '-••••-' || right(license_key, 4) as masked_key
         from candidates
       ) grouped
       group by kind, value
       having count(*) > 1
       order by count(*) desc, value
       limit 80`,
    ),
  ]);

  return {
    licenses: licenses.rows,
    customers: customers.rows,
    subscriptions: subscriptions.rows,
    checks: checks.rows,
    duplicates: duplicates.rows,
  };
}

function LoginPage() {
  return (
    <main className="admin-shell login-shell">
      <section className="login-card">
        <div className="brand">LM</div>
        <h1>LohnMail Admin</h1>
        <p>Lizenzverwaltung ist durch <code>ADMIN_SECRET</code> geschützt.</p>
        <form action="/admin" method="get">
          <label>
            Admin Secret
            <input name="secret" type="password" placeholder="ADMIN_SECRET eingeben" autoFocus />
          </label>
          <button type="submit">Admin öffnen</button>
        </form>
      </section>
      <style>{adminCss}</style>
    </main>
  );
}

function Metric({ label, value, tone = 'neutral' }) {
  return (
    <article className={`metric ${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function StripeLink({ id, type, children }) {
  if (!id) return <span>-</span>;
  const path = type === 'customer' ? `customers/${id}` : `subscriptions/${id}`;
  return <a href={`${stripeBase()}/${path}`} target="_blank" rel="noreferrer">{children || id}</a>;
}

function Table({ columns, rows, empty }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={row.id || row.stripe_subscription_id || row.license_key || `${row.value}-${index}`}>
              {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : text(row[column.key])}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={columns.length} className="empty">{empty || 'Keine Einträge.'}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminPage({ searchParams }) {
  const params = await searchParams;
  const secret = params?.secret || '';
  if (!isAuthorized(secret)) return <LoginPage />;

  let data;
  let error = '';
  try {
    data = await loadAdminData();
  } catch (err) {
    data = { licenses: [], customers: [], subscriptions: [], checks: [], duplicates: [] };
    error = err.message || 'Admin Daten konnten nicht geladen werden.';
  }

  const activeCount = data.licenses.filter((license) => ACTIVE_STATUSES.has(String(license.status || '').toLowerCase())).length;
  const problemCount = data.licenses.filter((license) => PROBLEM_STATUSES.has(String(license.status || '').toLowerCase())).length;
  const subscriptionCount = data.licenses.filter((license) => license.type === 'subscription').length;
  const trialCount = data.licenses.filter((license) => license.type === 'trial').length;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p>LohnMail License Server</p>
          <h1>Admin Dashboard</h1>
        </div>
        <a className="ghost" href="/">Public Seite</a>
      </header>

      {error ? <section className="notice bad">{error}</section> : null}

      <section className="metrics">
        <Metric label="Lizenzen" value={data.licenses.length} />
        <Metric label="Aktiv" value={activeCount} tone="ok" />
        <Metric label="Probleme" value={problemCount} tone={problemCount ? 'bad' : 'ok'} />
        <Metric label="Subscriptions" value={subscriptionCount} />
        <Metric label="Trials" value={trialCount} />
        <Metric label="Dubletten" value={data.duplicates.length} tone={data.duplicates.length ? 'bad' : 'ok'} />
      </section>

      <AdminLicenseForm adminSecret={secret} />

      <section className="panel">
        <div className="panel-head">
          <h2>Lizenzen</h2>
          <small>Letzte 200 Einträge</small>
        </div>
        <Table
          rows={data.licenses}
          columns={[
            { key: 'status', label: 'Status', render: (row) => <span className={`badge ${statusClass(row.status)}`}>{text(row.status)}</span> },
            { key: 'license_key', label: 'License Key', render: (row) => <code>{maskLicenseKey(row.license_key)}</code> },
            { key: 'type', label: 'Typ' },
            { key: 'plan', label: 'Plan' },
            { key: 'email', label: 'E-Mail' },
            { key: 'company_name', label: 'Firma' },
            { key: 'activated_machine_id', label: 'Machine ID', render: (row) => <code>{text(row.activated_machine_id)}</code> },
            { key: 'stripe_customer_id', label: 'Stripe Kunde', render: (row) => <StripeLink id={row.stripe_customer_id} type="customer">{text(row.stripe_customer_id)}</StripeLink> },
            { key: 'stripe_subscription_id', label: 'Subscription', render: (row) => <StripeLink id={row.stripe_subscription_id} type="subscription">{text(row.stripe_subscription_id)}</StripeLink> },
            { key: 'current_period_end', label: 'Periode bis', render: (row) => fmtDate(row.current_period_end || row.trial_ends_at) },
            { key: 'created_at', label: 'Erstellt', render: (row) => fmtDate(row.created_at) },
          ]}
        />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Mögliche Dubletten</h2>
          <small>Aktive/billable Subscription-Lizenzen mit gleicher Machine ID oder E-Mail</small>
        </div>
        <Table
          rows={data.duplicates}
          empty="Keine Dubletten erkannt."
          columns={[
            { key: 'kind', label: 'Typ' },
            { key: 'value', label: 'Wert', render: (row) => <code>{text(row.value)}</code> },
            { key: 'count', label: 'Anzahl' },
            { key: 'license_keys', label: 'License Keys' },
            { key: 'subscriptions', label: 'Subscriptions' },
          ]}
        />
      </section>

      <section className="grid two">
        <section className="panel">
          <div className="panel-head">
            <h2>Kunden</h2>
            <small>Letzte 200</small>
          </div>
          <Table
            rows={data.customers}
            columns={[
              { key: 'email', label: 'E-Mail' },
              { key: 'company_name', label: 'Firma' },
              { key: 'stripe_customer_id', label: 'Stripe', render: (row) => <StripeLink id={row.stripe_customer_id} type="customer">{text(row.stripe_customer_id)}</StripeLink> },
              { key: 'license_count', label: 'Lizenzen' },
              { key: 'active_license_count', label: 'Aktiv' },
              { key: 'created_at', label: 'Erstellt', render: (row) => fmtDate(row.created_at) },
            ]}
          />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Subscriptions</h2>
            <small>Letzte 200</small>
          </div>
          <Table
            rows={data.subscriptions}
            columns={[
              { key: 'status', label: 'Status', render: (row) => <span className={`badge ${statusClass(row.status)}`}>{text(row.status)}</span> },
              { key: 'stripe_subscription_id', label: 'Subscription', render: (row) => <StripeLink id={row.stripe_subscription_id} type="subscription">{text(row.stripe_subscription_id)}</StripeLink> },
              { key: 'email', label: 'E-Mail' },
              { key: 'company_name', label: 'Firma' },
              { key: 'current_period_end', label: 'Bis', render: (row) => fmtDate(row.current_period_end) },
              { key: 'cancel_at_period_end', label: 'Kündigt', render: (row) => row.cancel_at_period_end ? 'Ja' : 'Nein' },
            ]}
          />
        </section>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Letzte Lizenzprüfungen</h2>
          <small>Letzte 80 Checks aus der Desktop-App</small>
        </div>
        <Table
          rows={data.checks}
          columns={[
            { key: 'status', label: 'Status', render: (row) => <span className={`badge ${statusClass(row.status)}`}>{text(row.status)}</span> },
            { key: 'license_key', label: 'License Key', render: (row) => <code>{maskLicenseKey(row.license_key)}</code> },
            { key: 'machine_id', label: 'Machine ID', render: (row) => <code>{text(row.machine_id)}</code> },
            { key: 'checked_at', label: 'Zeit', render: (row) => fmtDate(row.checked_at) },
            { key: 'app_version', label: 'App' },
            { key: 'ip', label: 'IP' },
          ]}
        />
      </section>

      <section className="panel help">
        <h2>Admin API</h2>
        <p>Manuelle Aktionen laufen weiterhin über geschützte API-Endpunkte mit Header <code>Authorization: Bearer ADMIN_SECRET</code>.</p>
        <div className="code-grid">
          <code>POST /api/admin/licenses/create</code>
          <code>POST /api/admin/licenses/trial</code>
          <code>POST /api/admin/licenses/revoke</code>
        </div>
      </section>

      <style>{adminCss}</style>
    </main>
  );
}

const adminCss = `
  .admin-shell{max-width:1480px;margin:0 auto;padding:32px;color:#0f172a}
  .login-shell{min-height:100vh;display:grid;place-items:center}
  .login-card{width:min(440px,calc(100vw - 32px));background:white;border:1px solid #dbe5ee;border-radius:16px;padding:28px;box-shadow:0 22px 60px rgba(15,23,42,.12)}
  .brand{width:54px;height:54px;border-radius:14px;background:#008357;color:white;display:grid;place-items:center;font-weight:900;margin-bottom:18px}
  h1,h2,p{margin:0}
  .login-card h1{font-size:30px;margin-bottom:8px}
  .login-card p{color:#64748b;margin-bottom:20px;line-height:1.45}
  .login-card label{display:grid;gap:8px;font-weight:800}
  .login-card input{height:44px;border:1px solid #dbe5ee;border-radius:10px;padding:0 12px;font-size:15px}
  .login-card button,.ghost{height:44px;border:0;border-radius:10px;background:#008357;color:white;font-weight:900;padding:0 18px;text-decoration:none;display:inline-grid;place-items:center;margin-top:14px}
  .admin-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
  .admin-header p{color:#008357;font-weight:900;margin-bottom:4px}
  .admin-header h1{font-size:34px}
  .ghost{background:white;color:#008357;border:1px solid #cce8db;margin:0}
  .metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:18px}
  .metric{background:white;border:1px solid #dbe5ee;border-radius:14px;padding:16px;box-shadow:0 12px 32px rgba(15,23,42,.05)}
  .metric small{display:block;color:#64748b;font-weight:800;margin-bottom:8px}
  .metric strong{font-size:28px}
  .metric.ok strong{color:#008357}.metric.warn strong{color:#d97706}.metric.bad strong{color:#e11d48}
  .panel{background:white;border:1px solid #dbe5ee;border-radius:16px;box-shadow:0 12px 32px rgba(15,23,42,.05);margin-bottom:18px;overflow:hidden}
  .panel-head{min-height:56px;padding:16px 18px;border-bottom:1px solid #edf2f7;display:flex;justify-content:space-between;gap:12px;align-items:center}
  .panel h2{font-size:18px}
  .panel small{color:#64748b}
  .license-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding:18px}
  .license-form label{display:grid;gap:7px;color:#334155;font-size:13px;font-weight:900}
  .license-form input,.license-form select{height:42px;border:1px solid #dbe5ee;border-radius:10px;padding:0 12px;color:#0f172a;background:white;font:inherit;font-weight:700}
  .license-form input:disabled{background:#f1f5f9;color:#94a3b8}
  .license-form .wide{grid-column:span 2}
  .license-form button,.created-license button{height:42px;border:0;border-radius:10px;background:#008357;color:white;font-weight:900;padding:0 16px;align-self:end}
  .license-form button:disabled{opacity:.65}
  .form-message{margin:0 18px 18px;padding:12px 14px;border-radius:12px;font-weight:800}.form-message.bad{background:#fee2e2;color:#dc2626}
  .form-message.ok{background:#dcfce7;color:#008357}
  .created-license{margin:0 18px 18px;padding:14px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:12px;display:flex;justify-content:space-between;gap:14px;align-items:center}
  .created-license small{display:block;margin-bottom:8px;color:#008357;font-weight:900}
  .created-license code{font-size:15px;background:white}
  .trial-admin{border-top:1px solid #edf2f7;padding-top:16px}
  .trial-admin>div:first-child{padding:0 18px 12px}
  .trial-admin h3{font-size:16px;margin:0 0 5px}
  .trial-admin p{margin:0;color:#64748b;font-size:13px;line-height:1.4}
  .trial-form{display:grid;grid-template-columns:2fr 1fr auto auto;gap:14px;padding:0 18px 18px}
  .trial-form label{display:grid;gap:7px;color:#334155;font-size:13px;font-weight:900}
  .trial-form input{height:42px;border:1px solid #dbe5ee;border-radius:10px;padding:0 12px;color:#0f172a;background:white;font:inherit;font-weight:700}
  .trial-form button{height:42px;border:0;border-radius:10px;background:#008357;color:white;font-weight:900;padding:0 16px;align-self:end}
  .trial-form button.danger{background:#dc2626}
  .grid.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .table-wrap{overflow:auto}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{height:42px;text-align:left;background:#fbfdff;color:#334155;font-size:12px;text-transform:uppercase;letter-spacing:.02em;padding:0 12px;border-bottom:1px solid #edf2f7;white-space:nowrap}
  td{height:46px;padding:0 12px;border-bottom:1px solid #edf2f7;color:#334155;white-space:nowrap}
  tr:last-child td{border-bottom:0}
  code{font-family:"SFMono-Regular",Consolas,monospace;background:#f1f5f9;border-radius:7px;padding:4px 6px;color:#334155}
  a{color:#006bd6;text-decoration:none;font-weight:800}
  a:hover{text-decoration:underline}
  .badge{border-radius:999px;padding:5px 9px;font-size:12px;font-weight:900;text-transform:capitalize}
  .badge.ok{background:#dcfce7;color:#008357}.badge.warn{background:#fff4db;color:#c2410c}.badge.bad{background:#fee2e2;color:#dc2626}
  .empty{height:60px;color:#64748b;text-align:center}
  .notice{padding:14px 16px;border-radius:12px;margin-bottom:16px;font-weight:800}.notice.bad{background:#fee2e2;color:#dc2626}
  .help{padding:18px}.help p{margin-top:8px;color:#64748b}.code-grid{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
  @media (max-width:1100px){.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.grid.two{grid-template-columns:1fr}.license-form{grid-template-columns:repeat(2,minmax(0,1fr))}.trial-form{grid-template-columns:1fr 1fr}}
  @media (max-width:720px){.admin-shell{padding:18px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-header{align-items:flex-start;gap:12px;flex-direction:column}.license-form{grid-template-columns:1fr}.license-form .wide{grid-column:auto}.created-license{align-items:flex-start;flex-direction:column}.trial-form{grid-template-columns:1fr}}
`;
