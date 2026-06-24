import { createAdminClient } from '@/lib/supabase/admin';
import { placeDetails, textSearch } from './sources/google-places';

export type WebsiteCandidate = {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  types: string[];
  matchedPostcode: boolean;
  matchedPhone: boolean;
  confidence: 'high' | 'medium' | 'low';
};

export type FindWebsiteResult = {
  ok: boolean;
  query: string;
  candidate: WebsiteCandidate | null;
  reason: string | null;
};

// Looks up a prospect on Google Places by name+postcode, picks the best
// match, and reports the website it found plus how confident we are.
// Cross-checks Google's returned postcode and phone against what's
// stored on the prospect (from GIAS for schools, from Companies House
// for businesses) — phone match is the strongest signal because phone
// numbers are unique, postcode match is also strong, name similarity
// is the weakest.
export async function findWebsiteForProspect(
  prospectId: string,
): Promise<FindWebsiteResult> {
  const supabase = createAdminClient();
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('business_name, postcode, phone, address')
    .eq('id', prospectId)
    .maybeSingle();
  if (error || !prospect) {
    return { ok: false, query: '', candidate: null, reason: 'Prospect not found' };
  }
  const p = prospect as {
    business_name: string;
    postcode: string | null;
    phone: string | null;
    address: string | null;
  };

  const queryParts = [p.business_name, p.postcode].filter(Boolean) as string[];
  const query = queryParts.join(' ');
  if (!query) {
    return { ok: false, query: '', candidate: null, reason: 'No name to search by' };
  }

  let results;
  try {
    results = await textSearch(query);
  } catch (err) {
    return {
      ok: false,
      query,
      candidate: null,
      reason: `Google Places: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (results.length === 0) {
    return { ok: false, query, candidate: null, reason: 'No matches from Google Places' };
  }

  const wantedPostcode = stripSpaces(p.postcode);
  const wantedPhone = digitsOnly(p.phone);

  let best: WebsiteCandidate | null = null;
  for (const r of results.slice(0, 5)) {
    const details = await placeDetails(r.place_id);
    if (!details) continue;
    const gotPostcode = stripSpaces(details.formatted_address ?? '');
    const gotPhone = digitsOnly(details.formatted_phone_number ?? '');
    const matchedPostcode = !!wantedPostcode && gotPostcode.includes(wantedPostcode);
    const matchedPhone = !!wantedPhone && gotPhone === wantedPhone;

    const confidence: 'high' | 'medium' | 'low' =
      matchedPhone || (matchedPostcode && nameMatch(p.business_name, details.name))
        ? 'high'
        : matchedPostcode
          ? 'medium'
          : 'low';

    const candidate: WebsiteCandidate = {
      name: details.name,
      address: details.formatted_address,
      phone: details.formatted_phone_number,
      website: details.website,
      types: details.types ?? [],
      matchedPostcode,
      matchedPhone,
      confidence,
    };

    // Keep the strongest match across the candidates we inspect.
    if (
      !best ||
      rankConfidence(candidate.confidence) > rankConfidence(best.confidence)
    ) {
      best = candidate;
    }
    if (candidate.confidence === 'high' && candidate.website) break;
  }

  if (!best) {
    return { ok: false, query, candidate: null, reason: 'Place details returned nothing usable' };
  }
  return { ok: true, query, candidate: best, reason: null };
}

function stripSpaces(s: string | null): string {
  return (s ?? '').replace(/\s+/g, '').toUpperCase();
}

function digitsOnly(s: string | null): string {
  // Trim leading 0 / +44 so '01179031932' and '+441179031932' both compare equal.
  return (s ?? '')
    .replace(/\D/g, '')
    .replace(/^0/, '')
    .replace(/^44/, '');
}

function nameMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/(school|primary|infant|junior|secondary|the|of|saint|st\.?|c of e|c\.of\.e)/g, '')
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

function rankConfidence(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 3 : c === 'medium' ? 2 : 1;
}
