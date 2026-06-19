-- Phase B scaffolding for the Email module.
-- email_campaigns hold drafts authored inside MARK and tracked until pushed
-- to dotdigital as ready-to-send drafts. email_voice_exemplars cache past
-- campaigns pulled from dotdigital so the operator can mark the well-written
-- ones as voice anchors for the AI drafter.

create table email_campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'pushed', 'failed')),

  -- Operator-set context — drives the AI drafter
  internal_name text,                   -- 'Schools — June newsletter'
  sector text,                          -- 'Schools', 'Cricket clubs', etc.
  campaign_type text                    -- 'newsletter' | 'promotional' | 'announcement'
    check (campaign_type in ('newsletter', 'promotional', 'announcement') or campaign_type is null),
  intent text,                          -- short brief: 'announce new acrylic sizes'

  -- Targeting
  address_book_ids integer[] not null default '{}',

  -- Generated content
  subject text,
  preheader text,
  html_body text,

  -- dotdigital linkage
  dotdigital_campaign_id integer,
  pushed_at timestamptz,

  -- Audit
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_campaigns_brand_status_idx on email_campaigns (brand_id, status);

create trigger email_campaigns_set_updated_at
  before update on email_campaigns
  for each row execute function set_updated_at();

create table email_voice_exemplars (
  id uuid primary key default gen_random_uuid(),
  dotdigital_campaign_id integer unique not null,
  name text,
  subject text,
  html_body text,
  plain_body text,
  send_count integer,
  sent_at timestamptz,
  -- Operator flags so we only ground the AI on emails the operator
  -- considers representative of the voice they want.
  is_voice_anchor boolean not null default false,
  brand_id uuid references brands(id),
  sector text,
  notes text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index email_voice_exemplars_anchor_idx on email_voice_exemplars (is_voice_anchor)
  where is_voice_anchor = true;
