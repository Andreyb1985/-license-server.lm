# LohnMail License Server

Next.js API server for LohnMail trial, Stripe subscriptions and manual licenses.

## Environment

Create `local.env` locally and configure the same variables in Vercel.
`local.env` is intentionally visible in Finder, but it must stay uncommitted:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
CRON_SECRET=replace-with-a-long-random-value
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DATABASE_URL=postgres://...
LICENSE_SECRET=change-me-long-random-secret
ADMIN_SECRET=change-me-admin-secret
LOHNMAIL_INSTALLER_URL=https://lohn-mail.de/downloads/LohnMail-macOS.dmg
```

Never expose `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`,
`LICENSE_SECRET` or `ADMIN_SECRET` to the frontend or desktop app.

## Desktop installer download

The `Kostenlos herunterladen` button opens `/api/download`. This route redirects
to the public HTTPS address configured in `LOHNMAIL_INSTALLER_URL`.

1. Build and sign the LohnMail desktop installer.
2. Upload it to a stable public location, for example the LohnMail website,
   Vercel Blob, or a GitHub Release.
3. Add `LOHNMAIL_INSTALLER_URL` in the Vercel project under
   `Settings > Environment Variables`.
4. Redeploy the production deployment.

If the variable is missing or invalid, the route returns a user-friendly
maintenance page instead of a placeholder JSON response.

## Database

Use Supabase or Neon Postgres and run:

```bash
psql "$DATABASE_URL" -f migrations/001_license_schema.sql
psql "$DATABASE_URL" -f migrations/002_licensee_fields.sql
psql "$DATABASE_URL" -f migrations/003_invoice_billing.sql
```

Migration `002_licensee_fields.sql` is required for databases created before
license-holder address and company-number fields were introduced. It is
idempotent and can safely be run more than once.

Tables:

- `customers`
- `subscriptions`
- `licenses`
- `license_checks`

License keys are generated only on this server. The desktop app stores the key
and sends it to `/api/license/check`; it never creates valid keys.

## Stripe Setup

1. Create a Stripe Product: `LohnMail Professional`.
2. Create a recurring monthly price: `40 EUR / month`.
3. Copy the price id into `STRIPE_PRICE_ID`.
4. Enable Customer Portal in Stripe Billing settings.
5. Add a webhook endpoint:
   `https://YOUR_DOMAIN/api/stripe/webhook`
6. Subscribe the webhook to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.finalized`
   - `invoice.sent`
   - `invoice.updated`
   - `invoice.marked_uncollectible`
   - `invoice.voided`
   - `charge.refunded`
   - `refund.created`
   - `charge.dispute.created`
   - `charge.dispute.closed`

### Payment methods

- Card payments use `/api/stripe/create-checkout-session` and Stripe Checkout.
- Invoice payments use `/api/stripe/create-invoice-subscription`.
- Invoice subscriptions use `send_invoice`, Stripe Customer Balance bank transfers,
  and 14 days until due.
- Enable Bank Transfers in Stripe Dashboard before using invoice payments. Stripe
  then includes the customer's virtual bank details on the invoice and reconciles
  incoming transfers with the open invoice.
- Stripe must be configured to send finalized invoices and payment reminders.
- The Vercel cron `/api/cron/reconcile-invoices` runs daily and marks open,
  overdue invoice licenses as `past_due`. Configure `CRON_SECRET` in Vercel.

## Local Run

```bash
cd license-server
npm install
npm run dev
```

For local Stripe webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`.

## Manual Licenses

Create a lifetime license:

```bash
npm run license:create -- --type lifetime --email user@example.com --company "Customer GmbH" --seats 1 --note "Manual lifetime"
```

Create a demo license with expiration:

```bash
npm run license:create -- --type demo --email demo@example.com --expires 2026-12-31T23:59:59Z
```

Revoke a license:

```bash
npm run license:revoke -- --license-key LM-LIFE-...
```

Admin API variants require:

```text
Authorization: Bearer ADMIN_SECRET
```

## Desktop Flow

Configure the desktop app:

```bash
export LICENSE_SERVER_URL=https://YOUR_DOMAIN
LOHNMAIL_UI=web python3 main.py
```

The first online check creates a 60-day trial license and binds it to the local
machine id. LohnMail checks the license once per week and before important
actions when the last successful online check is older than seven days:

- processing payroll PDFs;
- sending emails;
- exporting reports.

If the server is temporarily unavailable, subscription licenses keep a 7-day
offline grace period. Lifetime and internal licenses keep a 30-day offline grace
period. Past-due, revoked, expired, refunded, disputed, unpaid and invalid
licenses are blocked.

## Vercel Deploy

1. Import `license-server/` as the Vercel project root.
2. Add all environment variables from `env.example`.
3. Run the database migration against production Postgres.
4. Deploy.
5. Add the production webhook URL in Stripe and set the production
   `STRIPE_WEBHOOK_SECRET`.
6. Set the desktop `LICENSE_SERVER_URL` to the deployed Vercel URL.
