create extension if not exists pgcrypto;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text,
  company_name text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  stripe_subscription_id text unique,
  status text not null,
  price_id text,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  license_key text unique,
  license_key_hash text unique,
  type text not null check (type in ('trial','subscription','lifetime','demo','internal')),
  status text not null check (status in ('trialing','active','expiring_soon','past_due','unpaid','canceled','expired','refunded','disputed','revoked','invalid','no_connection')),
  plan text,
  company_name text,
  email text,
  seats integer not null default 1,
  activated_machine_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  last_check_at timestamptz,
  created_by text,
  note text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists license_checks (
  id uuid primary key default gen_random_uuid(),
  license_key text not null,
  machine_id text not null,
  status text not null,
  checked_at timestamptz not null default now(),
  ip text,
  app_version text
);

create index if not exists customers_email_idx on customers (lower(email));
create index if not exists subscriptions_customer_idx on subscriptions (customer_id);
create index if not exists licenses_machine_idx on licenses (activated_machine_id);
create index if not exists licenses_customer_idx on licenses (customer_id);
create index if not exists licenses_subscription_idx on licenses (stripe_subscription_id);
create index if not exists license_checks_key_idx on license_checks (license_key);
create index if not exists license_checks_machine_idx on license_checks (machine_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_updated_at on customers;
create trigger customers_updated_at before update on customers for each row execute function set_updated_at();

drop trigger if exists subscriptions_updated_at on subscriptions;
create trigger subscriptions_updated_at before update on subscriptions for each row execute function set_updated_at();

drop trigger if exists licenses_updated_at on licenses;
create trigger licenses_updated_at before update on licenses for each row execute function set_updated_at();
