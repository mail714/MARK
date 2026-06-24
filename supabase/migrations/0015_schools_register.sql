-- Local copy of the gov.uk 'Get Information About Schools' (GIAS) register.
-- The bulk CSV is the canonical source — updated daily, ~25k schools, easy
-- to sync. We keep the most useful columns and skip the rest to keep the
-- schema clean. Status='Open' filters out closed/proposed schools in queries.

create table schools_register (
  urn text primary key,                    -- GIAS Unique Reference Number
  establishment_name text not null,
  status text,                             -- 'Open', 'Closed', 'Proposed to open' etc.
  type_of_establishment text,              -- 'Community school', 'Academy converter' etc.
  phase_of_education text,                 -- 'Primary', 'Secondary', 'All-through' etc.
  establishment_type_group text,           -- 'Local authority maintained schools' etc.
  statutory_low_age integer,
  statutory_high_age integer,
  gender text,                             -- 'Mixed', 'Boys', 'Girls'
  religious_character text,
  school_capacity integer,
  number_of_pupils integer,
  number_of_boys integer,
  number_of_girls integer,
  head_title text,
  head_first_name text,
  head_last_name text,
  head_job_title text,
  telephone text,
  website text,
  street text,
  locality text,
  town text,
  county text,
  postcode text,
  la_name text,                            -- Local Authority (e.g. 'Bristol, City of')
  la_district text,
  easting integer,                         -- OS National Grid — can be converted to lat/lng later
  northing integer,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index schools_register_town_idx on schools_register (lower(town));
create index schools_register_la_idx on schools_register (lower(la_name));
create index schools_register_postcode_idx on schools_register (postcode);
create index schools_register_status_idx on schools_register (status);
create index schools_register_phase_idx on schools_register (phase_of_education);

create trigger schools_register_set_updated_at
  before update on schools_register
  for each row execute function set_updated_at();

-- A small log so the UI can show 'last synced at, X records imported'.
create table schools_register_syncs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  source_url text,
  records_imported integer not null default 0,
  records_updated integer not null default 0,
  last_error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Extend Chimera's source + search_mode check constraints to allow the new
-- 'gov-uk-schools' value used by the schools register source.
alter table chimera_searches drop constraint chimera_searches_source_check;
alter table chimera_searches add constraint chimera_searches_source_check
  check (source in ('google-places', 'csv-import', 'gov-uk-schools'));

alter table chimera_searches drop constraint chimera_searches_search_mode_check;
alter table chimera_searches add constraint chimera_searches_search_mode_check
  check (search_mode in ('grid', 'estate-sweep', 'gov-uk-schools'));
