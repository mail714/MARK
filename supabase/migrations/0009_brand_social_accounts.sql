-- Per-brand, per-platform social account metadata. Lets the AI drafter
-- reference real handles and gives Buffer / Metricool integrations a place
-- to live in Phase 2. One row per (brand_id, platform) pair — a brand with
-- multiple accounts on one platform is rare enough that we don't model it.

create table brand_social_accounts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  platform text not null
    check (platform in ('instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest')),
  handle text,
  profile_url text,
  scheduler_account_id text,             -- Buffer / Metricool reference, Phase 2
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, platform)
);

create index brand_social_accounts_brand_idx
  on brand_social_accounts (brand_id);

create trigger brand_social_accounts_set_updated_at
  before update on brand_social_accounts
  for each row execute function set_updated_at();
