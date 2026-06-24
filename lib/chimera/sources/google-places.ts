// Port of Chimera's grid scraper. Geocode → bounding box → overlapping
// circles → Nearby Search per cell, paged to 60 results each, deduped
// across cells by place_id. Then Place Details per unique place.

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const NEARBY_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY is not set');
  return key;
}

export type Bounds = {
  southwest: { lat: number; lng: number };
  northeast: { lat: number; lng: number };
};

export type Geocoded = {
  formattedAddress: string;
  lat: number;
  lng: number;
  bounds: Bounds;
};

export async function geocode(location: string): Promise<Geocoded> {
  const params = new URLSearchParams({ address: location, key: apiKey(), region: 'gb' });
  const res = await fetch(`${GEOCODE_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Geocode HTTP ${res.status}`);
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    results?: Array<{
      formatted_address: string;
      geometry: {
        location: { lat: number; lng: number };
        bounds?: Bounds;
        viewport?: Bounds;
      };
    }>;
  };
  if (data.status !== 'OK' || !data.results || data.results.length === 0) {
    throw new Error(`Geocode failed: ${data.status}${data.error_message ? ` — ${data.error_message}` : ''}`);
  }
  const r = data.results[0];
  const center = r.geometry.location;
  const bounds = r.geometry.bounds ?? r.geometry.viewport ?? {
    southwest: { lat: center.lat - 0.027, lng: center.lng - 0.027 },
    northeast: { lat: center.lat + 0.027, lng: center.lng + 0.027 },
  };
  return {
    formattedAddress: r.formatted_address,
    lat: center.lat,
    lng: center.lng,
    bounds,
  };
}

function metresToLat(m: number): number {
  return m / 111_320;
}
function metresToLng(m: number, lat: number): number {
  return m / (111_320 * Math.cos((lat * Math.PI) / 180));
}

export type GridPoint = { lat: number; lng: number };

export function generateGrid(
  bounds: Bounds,
  radiusM: number,
  overlap: number,
): GridPoint[] {
  const swLat = bounds.southwest.lat;
  const swLng = bounds.southwest.lng;
  const neLat = bounds.northeast.lat;
  const neLng = bounds.northeast.lng;
  const centreLat = (swLat + neLat) / 2;
  const stepM = radiusM * 2 * (1 - overlap);
  const stepLat = metresToLat(stepM);
  const stepLng = metresToLng(stepM, centreLat);

  const points: GridPoint[] = [];
  for (let lat = swLat; lat <= neLat + stepLat; lat += stepLat) {
    for (let lng = swLng; lng <= neLng + stepLng; lng += stepLng) {
      points.push({ lat: round6(lat), lng: round6(lng) });
    }
  }
  return points;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export type NearbyResult = {
  place_id: string;
  name: string;
  vicinity?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  geometry?: { location?: { lat: number; lng: number } };
};

type NearbyResponse = {
  status: string;
  error_message?: string;
  results?: NearbyResult[];
  next_page_token?: string;
};

async function nearbyPage(
  lat: number,
  lng: number,
  radiusM: number,
  opts: { type?: string | null; keyword?: string | null; pageToken?: string | null },
): Promise<{ results: NearbyResult[]; nextPageToken: string | null; status: string }> {
  let params: URLSearchParams;
  if (opts.pageToken) {
    params = new URLSearchParams({ pagetoken: opts.pageToken, key: apiKey() });
    // Google needs a short wait before next_page_token activates.
    await sleep(2000);
  } else {
    params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(radiusM),
      key: apiKey(),
    });
    if (opts.keyword) params.set('keyword', opts.keyword);
    else if (opts.type) params.set('type', opts.type);
  }
  const res = await fetch(`${NEARBY_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Nearby HTTP ${res.status}`);
  const data = (await res.json()) as NearbyResponse;
  if (data.status === 'REQUEST_DENIED') {
    throw new Error(`Google rejected the request: ${data.error_message ?? 'no detail'}`);
  }
  if (data.status === 'OVER_QUERY_LIMIT') {
    throw new Error('Google Places query limit exceeded');
  }
  return {
    results: data.results ?? [],
    nextPageToken: data.next_page_token ?? null,
    status: data.status,
  };
}

export type GridProgressCallback = (info: {
  cellIndex: number;
  totalCells: number;
  prospectsFound: number;
}) => Promise<void> | void;

export async function searchGrid(args: {
  grid: GridPoint[];
  radiusM: number;
  type: string | null;
  keyword: string | null;
  maxResults: number;
  onCellComplete?: GridProgressCallback;
  onNewResult?: (r: NearbyResult) => Promise<void> | void;
}): Promise<NearbyResult[]> {
  const seen = new Set<string>();
  const all: NearbyResult[] = [];

  for (let i = 0; i < args.grid.length; i++) {
    if (all.length >= args.maxResults) break;
    const cell = args.grid[i];

    let pageToken: string | null = null;
    for (let page = 0; page < 3; page++) {
      const { results, nextPageToken } = await nearbyPage(cell.lat, cell.lng, args.radiusM, {
        type: args.type,
        keyword: args.keyword,
        pageToken,
      });
      for (const r of results) {
        if (!r.place_id || seen.has(r.place_id)) continue;
        seen.add(r.place_id);
        all.push(r);
        if (args.onNewResult) await args.onNewResult(r);
      }
      if (!nextPageToken) break;
      pageToken = nextPageToken;
    }

    if (args.onCellComplete) {
      await args.onCellComplete({
        cellIndex: i + 1,
        totalCells: args.grid.length,
        prospectsFound: all.length,
      });
    }
  }
  return all;
}

export type PlaceDetails = {
  name: string;
  formatted_address: string | null;
  formatted_phone_number: string | null;
  website: string | null;
  rating: number | null;
  user_ratings_total: number | null;
  business_status: string | null;
  types: string[];
};

export async function placeDetails(placeId: string): Promise<PlaceDetails | null> {
  const fields = [
    'name',
    'formatted_address',
    'formatted_phone_number',
    'website',
    'rating',
    'user_ratings_total',
    'business_status',
    'types',
  ].join(',');
  const params = new URLSearchParams({ place_id: placeId, fields, key: apiKey(), region: 'gb' });
  const res = await fetch(`${DETAILS_URL}?${params.toString()}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { status: string; result?: PlaceDetails };
  if (data.status !== 'OK' || !data.result) return null;
  return data.result;
}

type TextSearchResponse = {
  status: string;
  error_message?: string;
  results?: NearbyResult[];
  next_page_token?: string;
};

// Free-text Place Search. Returns up to 60 results across 3 pages.
// Used for Stage 1 of the estate-sweep mode to find named parks / estates.
export async function textSearch(query: string): Promise<NearbyResult[]> {
  const out: NearbyResult[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 3; page++) {
    let params: URLSearchParams;
    if (pageToken) {
      params = new URLSearchParams({ pagetoken: pageToken, key: apiKey() });
      await sleep(2000);
    } else {
      params = new URLSearchParams({ query, key: apiKey(), region: 'gb' });
    }
    const res = await fetch(`${TEXT_SEARCH_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(`Text search HTTP ${res.status}`);
    const data = (await res.json()) as TextSearchResponse;
    if (data.status === 'REQUEST_DENIED') {
      throw new Error(`Google rejected the request: ${data.error_message ?? 'no detail'}`);
    }
    if (data.status === 'OVER_QUERY_LIMIT') {
      throw new Error('Google Places query limit exceeded');
    }
    for (const r of data.results ?? []) out.push(r);
    if (!data.next_page_token) break;
    pageToken = data.next_page_token;
  }
  return out;
}

// Tight nearby search around a single point (no grid). Used for Stage 2 of
// estate-sweep to enumerate every business sitting inside / next to a park
// or office building.
export async function nearbyAroundPoint(args: {
  lat: number;
  lng: number;
  radiusM: number;
  type?: string;
}): Promise<NearbyResult[]> {
  const out: NearbyResult[] = [];
  const seen = new Set<string>();
  let pageToken: string | null = null;
  for (let page = 0; page < 3; page++) {
    const { results, nextPageToken } = await nearbyPage(args.lat, args.lng, args.radiusM, {
      type: args.type ?? 'establishment',
      keyword: null,
      pageToken,
    });
    for (const r of results) {
      if (!r.place_id || seen.has(r.place_id)) continue;
      seen.add(r.place_id);
      out.push(r);
    }
    if (!nextPageToken) break;
    pageToken = nextPageToken;
  }
  return out;
}

export const PLACE_CATEGORIES = [
  { key: 'restaurant', type: 'restaurant', label: 'Restaurants' },
  { key: 'store', type: 'store', label: 'Retail stores' },
  { key: 'general_contractor', type: 'general_contractor', label: 'Construction & trades' },
  { key: 'beauty_salon', type: 'beauty_salon', label: 'Health & beauty salons' },
  { key: 'lawyer', type: 'lawyer', label: 'Professional services' },
  { key: 'gym', type: 'gym', label: 'Gyms & fitness' },
  { key: 'cafe', type: 'cafe', label: 'Cafes & coffee shops' },
  { key: 'bar', type: 'bar', label: 'Bars & pubs' },
  { key: 'pharmacy', type: 'pharmacy', label: 'Pharmacies' },
  { key: 'real_estate_agency', type: 'real_estate_agency', label: 'Estate agents' },
  { key: 'school', type: 'school', label: 'Schools' },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
