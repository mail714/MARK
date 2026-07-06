-- Manual calendar entries. Everything else on the marketing calendar is
-- derived from another module (email campaigns, case studies, social
-- posts); this table holds the events the operator types in by hand —
-- trade shows, print deadlines, reminders, anything without a home module.

create table calendar_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  brand_id uuid references brands(id) on delete set null,
  sector text,
  event_date timestamptz not null,
  status text not null default 'planned'
    check (status in ('planned', 'confirmed', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calendar_entries_date_idx on calendar_entries (event_date);

create trigger calendar_entries_set_updated_at
  before update on calendar_entries
  for each row execute function set_updated_at();
