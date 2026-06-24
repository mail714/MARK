-- Companies House enrichment for Chimera prospects. SIC codes are 5-digit
-- UK industry classifications (e.g. "84110" = General public administration).
-- Stored as text[] so a prospect with multiple registered activities holds
-- them all. Source column already supports 'companies-house' as a value via
-- the prospects.source text field (no enum constraint).

alter table prospects add column sic_codes text[] not null default '{}';
alter table prospects add column company_number text;

create index prospects_company_number_idx
  on prospects (company_number)
  where company_number is not null;

-- For estate-sweep searches that opt in to Companies House enrichment.
alter table chimera_searches
  add column pull_companies_house boolean not null default false;
