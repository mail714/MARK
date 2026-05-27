export type CaseStudyStatus =
  | 'pending'
  | 'generating'
  | 'draft'
  | 'approved'
  | 'published'
  | 'failed';

export type Brand = {
  id: string;
  slug: string;
  name: string;
  website_url: string;
  wix_site_id: string | null;
  drive_root_folder_id: string | null;
};

export type CaseStudy = {
  id: string;
  brand_id: string;
  status: CaseStudyStatus;
  drive_folder_id: string;
  drive_folder_name: string;
  so_number: string | null;
  customer_name: string | null;

  // Extracted spec
  board_type: string | null;
  board_size: string | null;
  back_colour: string | null;
  text_colour: string | null;
  edge_details: string | null;
  fixings: string | null;

  // Generated content
  h1_page_title: string | null;
  h1_introduction_text: string | null;
  h2_design_highlights_title: string | null;
  h2_design_highlights_text: string | null;
  h2_summary_title: string | null;
  h2_summary_text: string | null;
  cta_text: string | null;
  page_meta_title: string | null;
  page_meta_description: string | null;
  schema_title: string | null;
  schema_desc: string | null;

  club_types: string[];

  wix_item_id: string | null;
  wix_url_slug: string | null;
  wix_published_url: string | null;

  last_error: string | null;

  created_at: string;
  updated_at: string;
  generated_at: string | null;
  approved_at: string | null;
  published_at: string | null;
};
