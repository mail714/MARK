// Mirrors lib/chimera/sources/google-places.ts PLACE_CATEGORIES — kept as a
// separate const so client components can import without pulling the server
// scraper into the client bundle.

export const PLACE_CATEGORIES = [
  { key: 'restaurant', label: 'Restaurants' },
  { key: 'store', label: 'Retail stores' },
  { key: 'general_contractor', label: 'Construction & trades' },
  { key: 'beauty_salon', label: 'Health & beauty salons' },
  { key: 'lawyer', label: 'Professional services' },
  { key: 'gym', label: 'Gyms & fitness' },
  { key: 'cafe', label: 'Cafes & coffee shops' },
  { key: 'bar', label: 'Bars & pubs' },
  { key: 'pharmacy', label: 'Pharmacies' },
  { key: 'real_estate_agency', label: 'Estate agents' },
  { key: 'school', label: 'Schools' },
];
