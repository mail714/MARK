-- Phase C scaffolding for Chimera. Prospect discovery + review + push to
-- dotdigital. Multi-source from the outset (google-places now, csv-import
-- now, gov.uk-schools / companies-house / outscraper later) — single
-- prospects table with a source discriminator keeps everything deduped
-- across sources.

create table chimera_searches (
  id uuid primary key default gen_random_uuid(),
  source text not null
    check (source in ('google-places', 'csv-import')),
  location text,                       -- google-places: 'Bristol, UK'
  category text,                       -- google-places: 'plumber' or 'restaurant'
  category_label text,                 -- human-readable label for the UI
  grid_radius_m integer,
  grid_overlap_pct integer,
  max_results integer,
  apply_chain_filter boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  prospects_found integer not null default 0,
  prospects_with_email integer not null default 0,
  prospects_with_website integer not null default 0,
  chains_skipped integer not null default 0,
  grid_cells_total integer,
  grid_cells_processed integer not null default 0,
  notes text,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger chimera_searches_set_updated_at
  before update on chimera_searches
  for each row execute function set_updated_at();

create table prospects (
  id uuid primary key default gen_random_uuid(),
  source text not null,                -- 'google-places' | 'csv-import' | …
  source_id text,                      -- google place_id; csv: hash of email+domain+name
  business_name text not null,
  address text,
  google_address text,                 -- distinct from the website-confirmed address when they differ
  address_note text,
  postcode text,
  phone text,
  website text,
  website_domain text,                 -- lowercased registrable host for dedupe
  emails text[] not null default '{}',
  rating numeric,
  reviews integer,
  types text[] not null default '{}',
  raw jsonb,
  is_chain boolean not null default false,
  chain_reason text,
  first_found_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index prospects_domain_idx on prospects (website_domain) where website_domain is not null;
create index prospects_postcode_idx on prospects (postcode) where postcode is not null;
create index prospects_name_idx on prospects (lower(business_name));

create trigger prospects_set_updated_at
  before update on prospects
  for each row execute function set_updated_at();

-- Which search(es) found which prospect. A prospect re-found by a later
-- search just updates last_seen_at on prospects and gets a new link row.
create table prospect_searches (
  prospect_id uuid not null references prospects(id) on delete cascade,
  search_id uuid not null references chimera_searches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (prospect_id, search_id)
);

-- Per-brand assignment + status. A prospect can sit on multiple brands'
-- lists with different sectors and pipeline states.
create table prospect_brand_assignments (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  sector text,
  status text not null default 'new'
    check (status in ('new', 'approved', 'pushed', 'skipped')),
  pushed_to_dotdigital_book_id integer,
  pushed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prospect_id, brand_id)
);

create index prospect_brand_assignments_brand_status_idx
  on prospect_brand_assignments (brand_id, status);

create trigger prospect_brand_assignments_set_updated_at
  before update on prospect_brand_assignments
  for each row execute function set_updated_at();

-- Global suppression list: never resurface these in any search. Stored as
-- email / domain / business_name with whichever fields are known.
create table prospect_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  business_name text,
  reason text,
  added_by text,
  created_at timestamptz not null default now()
);

create index prospect_suppressions_email_idx
  on prospect_suppressions (lower(email))
  where email is not null;
create index prospect_suppressions_domain_idx
  on prospect_suppressions (lower(domain))
  where domain is not null;
