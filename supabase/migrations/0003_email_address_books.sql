-- Phase A scaffolding for the Email module.
-- Mirrors dotdigital address books into MARK with operator-set brand + sector
-- tags so we can categorise targeting for the AI drafter.

create table address_books (
  id uuid primary key default gen_random_uuid(),
  dotdigital_id integer not null,
  name text not null,
  contact_count integer,
  visibility text,
  brand_id uuid references brands(id),
  sector text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dotdigital_id)
);

create index address_books_brand_idx on address_books (brand_id);

create trigger address_books_set_updated_at
  before update on address_books
  for each row execute function set_updated_at();
