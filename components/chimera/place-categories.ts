// Mirrors lib/chimera/sources/google-places.ts PLACE_CATEGORIES — separate
// const so client components can import without pulling the server scraper
// into the client bundle.
//
// Two modes:
//   - 'grid' (default): geocode location → grid of circles → nearby search
//     each cell. Uses `type` when set (strict Google place type), otherwise
//     treats the human label as a keyword.
//   - 'estate-sweep': two-stage. Text search for each seed phrase to find
//     parks / estates / office buildings, then a tight nearby search around
//     each one to enumerate every tenant.

export type ChimeraCategory =
  | {
      key: string;
      label: string;
      mode: 'grid';
      type: string | null;          // Google place type or null for keyword search
      keyword?: string;             // sent as the search keyword (defaults to label)
      defaultChainFilter: boolean;
    }
  | {
      key: string;
      label: string;
      mode: 'estate-sweep';
      sweepSeeds: string[];         // text-search phrases for Stage 1
      sweepRadiusM: number;         // radius around each found estate for Stage 2
      defaultChainFilter: boolean;
    };

export const PLACE_CATEGORIES: ChimeraCategory[] = [
  { key: 'restaurant', label: 'Restaurants', mode: 'grid', type: 'restaurant', defaultChainFilter: true },
  { key: 'store', label: 'Retail stores', mode: 'grid', type: 'store', defaultChainFilter: true },
  { key: 'general_contractor', label: 'Construction & trades', mode: 'grid', type: 'general_contractor', defaultChainFilter: false },
  { key: 'beauty_salon', label: 'Health & beauty salons', mode: 'grid', type: 'beauty_salon', defaultChainFilter: true },
  { key: 'lawyer', label: 'Professional services', mode: 'grid', type: 'lawyer', defaultChainFilter: false },
  { key: 'gym', label: 'Gyms & fitness', mode: 'grid', type: 'gym', defaultChainFilter: true },
  { key: 'cafe', label: 'Cafes & coffee shops', mode: 'grid', type: 'cafe', defaultChainFilter: true },
  { key: 'bar', label: 'Bars & pubs', mode: 'grid', type: 'bar', defaultChainFilter: true },
  { key: 'pharmacy', label: 'Pharmacies', mode: 'grid', type: 'pharmacy', defaultChainFilter: true },
  { key: 'real_estate_agency', label: 'Estate agents', mode: 'grid', type: 'real_estate_agency', defaultChainFilter: false },
  { key: 'school', label: 'Schools', mode: 'grid', type: 'school', defaultChainFilter: false },

  // New: estate-sweep mode (two-stage). Every tenant inside the found sites.
  {
    key: 'office-multi-tenant',
    label: 'Office buildings (multi-tenant)',
    mode: 'estate-sweep',
    sweepSeeds: ['office building', 'business centre', 'serviced offices'],
    sweepRadiusM: 150,
    defaultChainFilter: false,
  },
  {
    key: 'business-park',
    label: 'Business parks / industrial estates',
    mode: 'estate-sweep',
    sweepSeeds: ['business park', 'industrial estate', 'trading estate', 'industrial park'],
    sweepRadiusM: 500,
    defaultChainFilter: false,
  },
  {
    key: 'retail-park',
    label: 'Retail parks',
    mode: 'estate-sweep',
    sweepSeeds: ['retail park', 'shopping park'],
    sweepRadiusM: 300,
    defaultChainFilter: true,
  },
  {
    key: 'trade-centre',
    label: 'Trade centres / wholesale parks',
    mode: 'estate-sweep',
    sweepSeeds: ['trade centre', 'wholesale park', 'trade park'],
    sweepRadiusM: 300,
    defaultChainFilter: false,
  },

  // New: direct keyword categories. Existing grid pipeline with a free-text
  // keyword — picks up commercial property managers, facilities firms.
  {
    key: 'managing-agents',
    label: 'Managing agents',
    mode: 'grid',
    type: null,
    keyword: 'managing agent commercial property',
    defaultChainFilter: false,
  },
  {
    key: 'facilities-managers',
    label: 'Facilities managers',
    mode: 'grid',
    type: null,
    keyword: 'facilities management',
    defaultChainFilter: false,
  },
];
