alter table subscriptions
  add column if not exists collection_method text,
  add column if not exists days_until_due integer,
  add column if not exists latest_invoice_id text,
  add column if not exists latest_invoice_status text,
  add column if not exists latest_invoice_due_at timestamptz;

create index if not exists subscriptions_invoice_due_idx
  on subscriptions (latest_invoice_due_at)
  where collection_method = 'send_invoice' and latest_invoice_status = 'open';
