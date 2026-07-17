# LohnMail License Server

Next.js API server for LohnMail trial, Stripe subscriptions and manual licenses.

## Environment

Create `local.env` locally and configure the same variables in Vercel.
`local.env` is intentionally visible in Finder, but it must stay uncommitted:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DATABASE_URL=postgres://...
LICENSE_SECRET=change-me-long-random-secret
ADMIN_SECRET=change-me-admin-secret
```

Never expose `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`,
`LICENSE_SECRET` or `ADMIN_SECRET` to the frontend or desktop app.

## Database

Use Supabase or Neon Postgres and run:

```bash
psql "$DATABASE_URL" -f migrations/001_license_schema.sql
psql "$DATABASE_URL" -f migrations/002_licensee_fields.sql
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
   - `invoice.payment_failed`
   - `charge.refunded`
   - `refund.created`
   - `charge.dispute.created`
   - `charge.dispute.closed`

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
period. Revoked, expired, refunded, disputed, unpaid and invalid licenses are
blocked.

## Vercel Deploy

1. Import `license-server/` as the Vercel project root.
2. Add all environment variables from `env.example`.
3. Run the database migration against production Postgres.
4. Deploy.
5. Add the production webhook URL in Stripe and set the production
   `STRIPE_WEBHOOK_SECRET`.
6. Set the desktop `LICENSE_SERVER_URL` to the deployed Vercel URL.
