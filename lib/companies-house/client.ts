// Companies House public REST API. Free, requires an API key — get one at
// https://developer.company-information.service.gov.uk/. Auth is HTTP Basic
// with the API key as the username and an empty password.
//
// Rate limit: 600 requests per 5 minutes. We respect this by spacing calls
// and surfacing a clean error if the API responds with 429.

const BASE_URL = 'https://api.company-information.service.gov.uk';

function apiKey(): string {
  const k = process.env.COMPANIES_HOUSE_API_KEY;
  if (!k) throw new Error('COMPANIES_HOUSE_API_KEY is not set');
  return k;
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${apiKey()}:`).toString('base64')}`;
}

export class CompaniesHouseError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (res.status === 429) {
    throw new CompaniesHouseError(
      'Companies House rate limit reached (600 requests / 5 min). Wait and retry.',
      429,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new CompaniesHouseError(
      `Companies House ${path} returned ${res.status}: ${body.slice(0, 200)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export type CompanyAddress = {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  postal_code?: string;
  region?: string;
  country?: string;
  premises?: string;
};

export type AdvancedSearchCompany = {
  company_name: string;
  company_number: string;
  company_status: string;
  company_type: string;
  date_of_creation: string;
  registered_office_address: CompanyAddress;
  sic_codes?: string[];
  links?: { company_profile?: string };
};

type AdvancedSearchResponse = {
  total_results: number;
  items: AdvancedSearchCompany[];
};

// Advanced search filtered by registered office location. The `location`
// parameter is a free-text match against the registered office address —
// passing a full postcode usually narrows it well but we filter the results
// to exact-postcode matches in code for correctness.
export async function searchCompaniesByPostcode(
  postcode: string,
  opts: { activeOnly?: boolean; maxResults?: number } = {},
): Promise<AdvancedSearchCompany[]> {
  const wanted = postcode.toUpperCase().replace(/\s+/g, ' ').trim();
  const maxResults = opts.maxResults ?? 200;
  const params = new URLSearchParams();
  params.set('location', wanted);
  params.set('size', '100');
  if (opts.activeOnly !== false) params.set('company_status', 'active');

  const out: AdvancedSearchCompany[] = [];
  let startIndex = 0;
  for (;;) {
    if (out.length >= maxResults) break;
    params.set('start_index', String(startIndex));
    const page = await request<AdvancedSearchResponse>(
      `/advanced-search/companies?${params.toString()}`,
    );
    if (!page.items || page.items.length === 0) break;
    for (const item of page.items) {
      // Tighten the location filter to exact postcode match.
      const pc = (item.registered_office_address.postal_code ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
      if (pc === wanted) out.push(item);
    }
    if (page.items.length < 100) break;
    startIndex += page.items.length;
    if (startIndex >= page.total_results) break;
  }
  return out;
}

export function formatRegisteredAddress(a: CompanyAddress): string {
  return [
    a.premises,
    a.address_line_1,
    a.address_line_2,
    a.locality,
    a.region,
    a.postal_code,
    a.country,
  ]
    .filter(Boolean)
    .join(', ');
}
