-- Reporting stats pulled back from dotdigital after a campaign sends.
-- One row per email campaign; the row is refreshed (not appended) so the
-- numbers reflect the latest sync. raw holds the full dotdigital summary
-- payload so future fields can be added without another migration.

create table email_campaign_stats (
  campaign_id uuid primary key references email_campaigns(id) on delete cascade,
  dotdigital_campaign_id integer not null,
  date_sent timestamptz,
  num_total_sent integer,
  num_total_recipients integer,
  num_unique_opens integer,
  num_total_opens integer,
  num_unique_clicks integer,
  num_total_clicks integer,
  num_hard_bounces integer,
  num_soft_bounces integer,
  num_unsubscribes integer,
  num_spam_complaints integer,
  num_forwards integer,
  num_replies integer,
  raw jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_campaign_stats_dd_id_idx
  on email_campaign_stats (dotdigital_campaign_id);

create trigger email_campaign_stats_set_updated_at
  before update on email_campaign_stats
  for each row execute function set_updated_at();
