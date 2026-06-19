-- Phase B push 2 scaffolding: image library for the email drafter.
-- Pull from Wix case studies (and later from Wix Media folders or Drive)
-- into a single table the drafter and operator picker share.

create table email_images (
  id uuid primary key default gen_random_uuid(),
  source text not null
    check (source in ('wix-case-study', 'wix-media', 'drive', 'upload')),
  source_id text not null,
  source_role text,                            -- 'main' | 'image_2' for case studies
  brand_id uuid references brands(id),
  sector text,
  customer_name text,                          -- nice-to-have label for case-study sources

  -- Image data
  url text not null,                           -- public URL to use directly in emails
  alt_text text,
  description text,                            -- short factual description, used by the AI for picking
  width integer,
  height integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),

  unique (source, source_id, source_role)
);

create index email_images_brand_sector_idx on email_images (brand_id, sector);

create trigger email_images_set_updated_at
  before update on email_images
  for each row execute function set_updated_at();

-- Campaigns get a hero image slot pulled from the library. Keeping it as
-- url + alt rather than a FK so a re-sync that drops an image doesn't
-- break already-drafted campaigns.
alter table email_campaigns add column hero_image_url text;
alter table email_campaigns add column hero_image_alt text;
