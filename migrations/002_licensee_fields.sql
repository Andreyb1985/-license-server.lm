alter table customers
  add column if not exists licensee_address text,
  add column if not exists licensee_company_number text;

alter table licenses
  add column if not exists licensee_address text,
  add column if not exists licensee_company_number text;
