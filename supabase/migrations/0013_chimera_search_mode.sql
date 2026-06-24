-- Two new search modes for Chimera. The estate-sweep mode does a two-stage
-- search: text search for parks/estates first, then a tight nearby search
-- around each one to capture every tenant.

alter table chimera_searches
  add column search_mode text not null default 'grid'
    check (search_mode in ('grid', 'estate-sweep'));

alter table chimera_searches
  add column sweep_seeds text[] not null default '{}';

alter table chimera_searches
  add column sweep_radius_m integer;
