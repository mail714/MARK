-- Phase C scaffolding for the Social module. social_posts holds one row per
-- platform-specific post. A single case study fans out into multiple rows
-- (one per platform configured for that brand), linked by source_type/source_id
-- so the originating case study or email is traceable.

create table social_posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'scheduled', 'published', 'failed')),

  -- Platform target
  platform text not null
    check (platform in ('instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest')),

  -- Source linkage — what the post was generated from
  source_type text
    check (source_type in ('case-study', 'email', 'standalone') or source_type is null),
  source_id uuid,

  -- Operator-set context
  sector text,
  internal_name text,

  -- Generated content
  caption text,
  hashtags text[] not null default '{}',
  media_urls text[] not null default '{}',
  media_alts text[] not null default '{}',
  media_kind text
    check (media_kind in ('image', 'video', 'none') or media_kind is null),
  shot_brief text,                       -- a prompt for the operator to film/shoot, when we don't have the media
  cta_url text,

  -- Scheduling
  planned_publish_at timestamptz,

  -- External scheduler linkage (Buffer / Metricool — Phase 2)
  scheduler_post_id text,
  live_url text,

  -- Audit
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index social_posts_brand_status_idx
  on social_posts (brand_id, status);
create index social_posts_planned_idx
  on social_posts (planned_publish_at)
  where planned_publish_at is not null;
create index social_posts_source_idx
  on social_posts (source_type, source_id)
  where source_id is not null;

create trigger social_posts_set_updated_at
  before update on social_posts
  for each row execute function set_updated_at();
