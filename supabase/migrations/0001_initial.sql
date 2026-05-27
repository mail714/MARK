-- Signet Marketing System — initial schema
-- Multi-brand from day one: every record carries a brand_id.

create extension if not exists "pgcrypto";

-- ---------- Brands ----------
create table brands (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                -- 'honours-boards', 'signet-signs', 'signet-play'
  name text not null,
  website_url text not null,
  wix_site_id text,
  drive_root_folder_id text,                -- Drive folder ID for this brand's case studies root
  created_at timestamptz not null default now()
);

-- ---------- Club Type vocabulary ----------
create table club_types (
  id serial primary key,
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  unique (brand_id, name)
);

-- ---------- Case studies ----------
create table case_studies (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'draft', 'approved', 'published', 'failed')),

  -- Drive source
  drive_folder_id text not null,
  drive_folder_name text not null,          -- '(60111) Thorpe Willoughby Sports Association'
  so_number text,
  customer_name text,

  -- Extracted spec
  board_type text,                          -- Wooden | Acrylic | Lettering
  board_size text,
  back_colour text,
  text_colour text,
  edge_details text,
  fixings text,

  -- Generated content (HTML, Wix-flavoured)
  h1_page_title text,
  h1_introduction_text text,
  h2_design_highlights_title text,
  h2_design_highlights_text text,
  h2_summary_title text,
  h2_summary_text text,
  cta_text text,
  page_meta_title text,
  page_meta_description text,
  schema_title text,
  schema_desc text,

  -- Categorisation
  club_types text[] not null default '{}',  -- ['Cricket'], ['Masons'], etc.

  -- Wix linkage
  wix_item_id text,
  wix_url_slug text,
  wix_published_url text,

  -- Failure tracking
  last_error text,

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  generated_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,

  unique (brand_id, drive_folder_id)
);

create index case_studies_brand_status_idx on case_studies (brand_id, status);
create index case_studies_so_number_idx on case_studies (so_number);

-- ---------- Photos ----------
create table case_study_photos (
  id uuid primary key default gen_random_uuid(),
  case_study_id uuid not null references case_studies(id) on delete cascade,
  drive_file_id text not null,
  original_filename text,
  role text not null
    check (role in ('main', 'image_2', 'candidate')),
  alt_text text,
  processed_storage_path text,              -- path in Supabase Storage for the 1200x900 version
  wix_media_url text,
  selected boolean not null default false,
  width int,
  height int,
  created_at timestamptz not null default now(),

  unique (case_study_id, drive_file_id)
);

create index case_study_photos_case_study_idx on case_study_photos (case_study_id);

-- ---------- Social posts ----------
create table social_posts (
  id uuid primary key default gen_random_uuid(),
  case_study_id uuid not null references case_studies(id) on delete cascade,
  brand_id uuid not null references brands(id),
  platform text not null
    check (platform in ('facebook', 'instagram', 'pinterest')),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'scheduled', 'published', 'failed')),
  body text,
  image_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  external_post_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (case_study_id, platform)
);

create index social_posts_status_idx on social_posts (status);

-- ---------- updated_at trigger ----------
create or replace function set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger case_studies_set_updated_at
  before update on case_studies
  for each row execute function set_updated_at();

create trigger social_posts_set_updated_at
  before update on social_posts
  for each row execute function set_updated_at();
