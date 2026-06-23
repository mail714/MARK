-- Per-link click counts pulled back from dotdigital. One row per (campaign,
-- link URL) pair, refreshed in place on every stats sync. Lets us see which
-- CTAs actually got clicks so the drafter (later) can prefer link patterns
-- that converted.

create table email_campaign_links (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references email_campaigns(id) on delete cascade,
  url text not null,
  total_clicks integer not null default 0,
  unique_clicks integer not null default 0,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, url)
);

create index email_campaign_links_campaign_idx
  on email_campaign_links (campaign_id);

create trigger email_campaign_links_set_updated_at
  before update on email_campaign_links
  for each row execute function set_updated_at();
