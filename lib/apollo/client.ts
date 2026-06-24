// Apollo.io REST API client. Authenticates via x-api-key header. The free
// tier gives 200 export credits per month — each unlocked contact returned
// is one credit — so callers keep per_page tight (2-3) by default.

const BASE_URL = 'https://api.apollo.io';

function apiKey(): string {
  const k = process.env.APOLLO_API_KEY;
  if (!k) throw new Error('APOLLO_API_KEY is not set');
  return k;
}

export class ApolloError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (res.status === 429) {
    throw new ApolloError(
      'Apollo rate limit reached. Try again in a minute, or upgrade for higher limits.',
      429,
    );
  }
  if (res.status === 402 || res.status === 403) {
    throw new ApolloError(
      "Apollo refused the request — out of credits, or this endpoint isn't enabled on your API key.",
      res.status,
    );
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new ApolloError(
      `Apollo ${path} returned ${res.status}: ${errBody.slice(0, 200)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

export type ApolloPerson = {
  id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  phone_numbers?: { sanitized_number?: string; raw_number?: string }[];
  linkedin_url?: string;
  organization?: { name?: string; website_url?: string };
};

type PeopleSearchResponse = {
  people?: ApolloPerson[];
  pagination?: { total_entries?: number };
};

// Apollo's people-search endpoint has been renamed multiple times in their
// API revisions — /mixed_people/search → /mixed_people/api_search →
// /people/search depending on plan and date. We try each in order and use
// whichever responds, so the integration survives Apollo's renames.
const PEOPLE_SEARCH_PATHS = [
  '/v1/mixed_people/api_search',
  '/v1/mixed_people/search',
  '/v1/people/search',
];

const DECISION_MAKER_SENIORITIES = [
  'owner',
  'founder',
  'c_suite',
  'partner',
  'head',
  'director',
  'manager',
];

async function tryPeopleSearchPaths(body: Record<string, unknown>): Promise<ApolloPerson[]> {
  let lastErr: ApolloError | null = null;
  for (const path of PEOPLE_SEARCH_PATHS) {
    try {
      const data = await request<PeopleSearchResponse>(path, body);
      return data.people ?? [];
    } catch (err) {
      if (err instanceof ApolloError && (err.statusCode === 404 || err.statusCode === 403)) {
        // Endpoint isn't on this plan or has been removed — try the next one.
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new ApolloError('No working people-search endpoint found.', 404);
}

// Looks up people at organisations whose registered domain matches the
// argument. Per_page caps the credit spend per prospect — Apollo charges
// one credit per unlocked contact in the result set.
export async function searchPeopleByDomain(args: {
  domain: string;
  perPage?: number;
}): Promise<ApolloPerson[]> {
  const perPage = Math.min(Math.max(args.perPage ?? 2, 1), 10);
  return tryPeopleSearchPaths({
    q_organization_domains_list: [args.domain],
    per_page: perPage,
    page: 1,
    person_seniorities: DECISION_MAKER_SENIORITIES,
  });
}

// Same idea but matched against the organisation name. Used for prospects
// that came in via Companies House and don't have a domain we can search.
export async function searchPeopleByOrganisationName(args: {
  name: string;
  perPage?: number;
}): Promise<ApolloPerson[]> {
  const perPage = Math.min(Math.max(args.perPage ?? 2, 1), 10);
  return tryPeopleSearchPaths({
    q_organization_name: args.name,
    per_page: perPage,
    page: 1,
    person_seniorities: DECISION_MAKER_SENIORITIES,
  });
}

// Apollo returns a placeholder string for emails that exist in their DB
// but aren't unlocked on the current plan. Filter these out — they're not
// usable for outreach.
const PLACEHOLDER_EMAIL = /email_not_unlocked|email_not_available/i;

export function isUsableEmail(email: string | undefined | null): email is string {
  if (!email) return false;
  if (PLACEHOLDER_EMAIL.test(email)) return false;
  return /.+@.+\..+/.test(email);
}

export function fullName(p: ApolloPerson): string {
  if (p.name) return p.name;
  return [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
}
