-- Saved Chimera segments. Each row is a reusable search criterion (e.g.
-- "Primary schools in Bristol") bound to a brand + sector + dotdigital
-- address book. Operator can re-run any saved segment to pick up newly
-- added prospects (e.g. new schools added to the GIAS register) and push
-- additions to the bound book without affecting the contacts already in it.

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- The exact payload that gets POSTed to /api/chimera/searches when this
  -- segment is run. Keeping it as a jsonb means new search modes work here
  -- with no schema changes.
  payload jsonb not null,
  -- Default brand + sector assigned to every prospect pulled by this segment.
  brand_id uuid not null references brands(id) on delete cascade,
  sector text,
  -- Optional dotdigital address book this segment syncs into.
  dotdigital_book_id integer,
  -- Latest run details for the saved-searches list view.
  last_run_search_id uuid references chimera_searches(id) on delete set null,
  last_run_at timestamptz,
  last_run_prospects integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_searches_brand_idx on saved_searches (brand_id);

create trigger saved_searches_set_updated_at
  before update on saved_searches
  for each row execute function set_updated_at();

-- Link runs back to their saved search so the list view can show recent
-- runs and the operator can navigate from a saved segment to its history.
alter table chimera_searches
  add column saved_search_id uuid references saved_searches(id) on delete set null;
alter table chimera_searches
  add column original_payload jsonb;

create index chimera_searches_saved_idx
  on chimera_searches (saved_search_id)
  where saved_search_id is not null;
