-- Generic progress-tracking table for long-running bulk operations
-- (Rescan websites, Apollo enrich, dotdigital push, etc). Each job persists
-- progress so the UI can poll and show 'X of Y · 47 emails added' instead
-- of a greyed-out button with no feedback.

create table bulk_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                       -- 'rescan-website' | 'apollo-enrich' | 'push-to-dotdigital'
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),

  -- Counters — kept flat for cheap reads. Not every kind uses every field.
  total integer not null default 0,
  processed integer not null default 0,
  succeeded integer not null default 0,
  failed integer not null default 0,
  emails_added integer not null default 0,
  contacts_added integer not null default 0,

  last_error text,
  errors jsonb not null default '[]',
  metadata jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bulk_jobs_status_idx on bulk_jobs (status, started_at desc);

create trigger bulk_jobs_set_updated_at
  before update on bulk_jobs
  for each row execute function set_updated_at();
