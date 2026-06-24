export type ChimeraSearchStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ChimeraSource = 'google-places' | 'csv-import';
export type ChimeraSearchMode = 'grid' | 'estate-sweep';

export type ChimeraSearch = {
  id: string;
  source: ChimeraSource;
  search_mode: ChimeraSearchMode;
  location: string | null;
  category: string | null;
  category_label: string | null;
  grid_radius_m: number | null;
  grid_overlap_pct: number | null;
  max_results: number | null;
  sweep_seeds: string[];
  sweep_radius_m: number | null;
  pull_companies_house: boolean;
  apply_chain_filter: boolean;
  status: ChimeraSearchStatus;
  prospects_found: number;
  prospects_with_email: number;
  prospects_with_website: number;
  chains_skipped: number;
  grid_cells_total: number | null;
  grid_cells_processed: number;
  notes: string | null;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Prospect = {
  id: string;
  source: string;
  source_id: string | null;
  business_name: string;
  address: string | null;
  google_address: string | null;
  address_note: string | null;
  postcode: string | null;
  phone: string | null;
  website: string | null;
  website_domain: string | null;
  emails: string[];
  rating: number | null;
  reviews: number | null;
  types: string[];
  raw: Record<string, unknown> | null;
  sic_codes: string[];
  company_number: string | null;
  is_chain: boolean;
  chain_reason: string | null;
  first_found_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type ProspectAssignmentStatus = 'new' | 'approved' | 'pushed' | 'skipped';

export type ProspectBrandAssignment = {
  id: string;
  prospect_id: string;
  brand_id: string;
  sector: string | null;
  status: ProspectAssignmentStatus;
  pushed_to_dotdigital_book_id: number | null;
  pushed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProspectSuppression = {
  id: string;
  email: string | null;
  domain: string | null;
  business_name: string | null;
  reason: string | null;
  added_by: string | null;
  created_at: string;
};
