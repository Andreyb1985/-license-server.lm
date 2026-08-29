create table if not exists license_operations (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  outcome text not null,
  source text not null,
  license_id uuid references licenses(id) on delete set null,
  license_key text,
  machine_id text,
  previous_machine_id text,
  status_before text,
  status_after text,
  ip text,
  app_version text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists license_operations_created_idx on license_operations (created_at desc);
create index if not exists license_operations_key_idx on license_operations (license_key);
create index if not exists license_operations_machine_idx on license_operations (machine_id);
create index if not exists license_operations_operation_idx on license_operations (operation);
