-- Apollo.io enrichment data on prospects. apollo_contacts holds the
-- per-person records (name, title, email, phone, linkedin) we got back from
-- Apollo. apollo_enriched_at lets us skip already-enriched prospects on
-- re-runs so we don't burn credits looking up the same companies.

alter table prospects
  add column apollo_contacts jsonb not null default '[]',
  add column apollo_enriched_at timestamptz;

create index prospects_apollo_enriched_idx
  on prospects (apollo_enriched_at)
  where apollo_enriched_at is not null;
