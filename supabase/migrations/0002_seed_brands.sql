-- Seed: three brands + Honours Boards starting club-type vocabulary.

insert into brands (slug, name, website_url) values
  ('honours-boards', 'Honours Boards', 'https://www.honours-boards.co.uk'),
  ('signet-signs',   'Signet Signs',   'https://www.signetsigns.co.uk'),
  ('signet-play',    'Signet Play',    'https://www.signet-play.co.uk')
on conflict (slug) do nothing;

-- Honours Boards club types (controlled vocabulary).
-- Other brands can be seeded later when their modules are built.
insert into club_types (brand_id, name)
select b.id, ct.name
from brands b
cross join (values
  ('Cricket'),
  ('Golf'),
  ('Tennis'),
  ('Bowls'),
  ('Football'),
  ('Rugby'),
  ('Hockey'),
  ('Swimming'),
  ('Squash'),
  ('Lawn Tennis'),
  ('School'),
  ('University'),
  ('Masons'),
  ('Police'),
  ('Military'),
  ('Donors / Benefactors')
) as ct(name)
where b.slug = 'honours-boards'
on conflict (brand_id, name) do nothing;
