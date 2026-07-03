import { createAdminClient } from '@/lib/supabase/admin';
import type {
  Prospect,
  ProspectAssignmentStatus,
  ProspectBrandAssignment,
  ProspectSuppression,
} from './types';

export async function upsertProspect(args: {
  source: string;
  source_id: string;
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
  is_chain: boolean;
  chain_reason: string | null;
  search_id: string;
}): Promise<string> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const row = {
    source: args.source,
    source_id: args.source_id,
    business_name: args.business_name,
    address: args.address,
    google_address: args.google_address,
    address_note: args.address_note,
    postcode: args.postcode,
    phone: args.phone,
    website: args.website,
    website_domain: args.website_domain,
    emails: args.emails,
    rating: args.rating,
    reviews: args.reviews,
    types: args.types,
    raw: args.raw,
    is_chain: args.is_chain,
    chain_reason: args.chain_reason,
    last_seen_at: now,
  };
  // Re-runs must never degrade a prospect: a site that gave us an email
  // last time might time out this time, and a blind upsert would replace
  // the good emails with an empty array. Merge instead — union the email
  // lists and only take new values where they're actually present.
  const { data: existing } = await supabase
    .from('prospects')
    .select('id, emails, phone, website, website_domain, address, google_address, address_note, postcode')
    .eq('source', args.source)
    .eq('source_id', args.source_id)
    .maybeSingle();

  let prospectId: string;
  if (existing) {
    const prev = existing as {
      id: string;
      emails: string[] | null;
      phone: string | null;
      website: string | null;
      website_domain: string | null;
      address: string | null;
      google_address: string | null;
      address_note: string | null;
      postcode: string | null;
    };
    const mergedEmails = Array.from(
      new Set(
        [...(prev.emails ?? []), ...args.emails]
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const { error } = await supabase
      .from('prospects')
      .update({
        ...row,
        emails: mergedEmails,
        phone: args.phone ?? prev.phone,
        website: args.website ?? prev.website,
        website_domain: args.website_domain ?? prev.website_domain,
        address: args.address ?? prev.address,
        google_address: args.google_address ?? prev.google_address,
        address_note: args.address_note ?? prev.address_note,
        postcode: args.postcode ?? prev.postcode,
      })
      .eq('id', prev.id);
    if (error) throw new Error(`Failed to update prospect: ${error.message}`);
    prospectId = prev.id;
  } else {
    const { data, error } = await supabase
      .from('prospects')
      .upsert(row, { onConflict: 'source,source_id' })
      .select('id')
      .single();
    if (error) throw new Error(`Failed to upsert prospect: ${error.message}`);
    prospectId = data.id as string;
  }

  await linkProspectToSearch(prospectId, args.search_id);
  return prospectId;
}

// Link a prospect to a search (idempotent). Used when persisting a freshly
// enriched prospect, and when a re-run rediscovers a business we already
// have — the new search should list it without re-paying for place
// details or a website scrape.
export async function linkProspectToSearch(
  prospectId: string,
  searchId: string,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('prospect_searches')
    .upsert({ prospect_id: prospectId, search_id: searchId }, {
      onConflict: 'prospect_id,search_id',
    });
}

// Bulk lookup of existing prospects by Google place id, so search runs can
// skip the paid enrichment (place details + website scrape) for businesses
// already in the database. Chunked to keep the .in() URL within limits.
export async function loadExistingProspectsByPlaceId(
  placeIds: string[],
): Promise<Map<string, { id: string; emails: string[]; website: string | null }>> {
  const out = new Map<string, { id: string; emails: string[]; website: string | null }>();
  if (placeIds.length === 0) return out;
  const supabase = createAdminClient();
  for (let i = 0; i < placeIds.length; i += 200) {
    const chunk = placeIds.slice(i, i + 200);
    const { data } = await supabase
      .from('prospects')
      .select('id, source_id, emails, website')
      .eq('source', 'google-places')
      .in('source_id', chunk);
    for (const r of (data ?? []) as Array<{
      id: string;
      source_id: string;
      emails: string[] | null;
      website: string | null;
    }>) {
      out.set(r.source_id, { id: r.id, emails: r.emails ?? [], website: r.website });
    }
  }
  return out;
}

export type ProspectListFilters = {
  searchId?: string;
  brandId?: string;
  status?: ProspectAssignmentStatus | 'unassigned';
  withEmail?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function listProspects(filters: ProspectListFilters = {}): Promise<{
  items: (Prospect & { assignments: ProspectBrandAssignment[] })[];
  total: number;
}> {
  const supabase = createAdminClient();
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  let query = supabase
    .from('prospects')
    .select(
      '*, prospect_brand_assignments(*), prospect_searches!inner(search_id)',
      { count: 'exact' },
    )
    .order('first_found_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.searchId) {
    query = query.eq('prospect_searches.search_id', filters.searchId);
  }
  if (filters.withEmail) {
    query = query.not('emails', 'eq', '{}');
  }
  if (filters.search) {
    const safe = filters.search.replace(/[%_,]/g, (c) => `\\${c}`);
    query = query.or(
      `business_name.ilike.%${safe}%,website_domain.ilike.%${safe}%,postcode.ilike.%${safe}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list prospects: ${error.message}`);

  let items = ((data ?? []) as (Prospect & {
    prospect_brand_assignments: ProspectBrandAssignment[];
  })[]).map((p) => ({
    ...p,
    assignments: p.prospect_brand_assignments ?? [],
  }));

  // Brand / status filters apply after fetch — assignments are 1:N per
  // prospect and PostgREST can't filter on them cleanly inside the parent row.
  if (filters.brandId) {
    items = items.filter((p) => p.assignments.some((a) => a.brand_id === filters.brandId));
  }
  if (filters.status === 'unassigned') {
    items = items.filter((p) => p.assignments.length === 0);
  } else if (filters.status) {
    items = items.filter((p) => p.assignments.some((a) => a.status === filters.status));
  }

  return { items, total: count ?? items.length };
}

export async function getProspect(id: string): Promise<Prospect | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load prospect: ${error.message}`);
  return (data as Prospect | null) ?? null;
}

export async function assignProspect(args: {
  prospect_id: string;
  brand_id: string;
  sector: string | null;
  status: ProspectAssignmentStatus;
  notes?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('prospect_brand_assignments')
    .upsert(
      {
        prospect_id: args.prospect_id,
        brand_id: args.brand_id,
        sector: args.sector,
        status: args.status,
        notes: args.notes ?? null,
      },
      { onConflict: 'prospect_id,brand_id' },
    );
  if (error) throw new Error(`Failed to assign prospect: ${error.message}`);
}

export async function bulkAssignProspects(
  ids: string[],
  args: {
    brand_id: string;
    sector: string | null;
    status: ProspectAssignmentStatus;
  },
): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createAdminClient();
  const rows = ids.map((id) => ({
    prospect_id: id,
    brand_id: args.brand_id,
    sector: args.sector,
    status: args.status,
  }));
  const { error } = await supabase
    .from('prospect_brand_assignments')
    .upsert(rows, { onConflict: 'prospect_id,brand_id' });
  if (error) throw new Error(`Failed to bulk-assign: ${error.message}`);
}

export async function listSuppressions(): Promise<ProspectSuppression[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('prospect_suppressions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load suppressions: ${error.message}`);
  return (data as ProspectSuppression[]) ?? [];
}

export async function addSuppression(args: {
  email?: string | null;
  domain?: string | null;
  business_name?: string | null;
  reason?: string | null;
  added_by?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('prospect_suppressions').insert(args);
  if (error) throw new Error(`Failed to add suppression: ${error.message}`);
}

export async function deleteSuppression(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('prospect_suppressions').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete suppression: ${error.message}`);
}

// Map of (email|domain|name) → true for fast in-memory checks during a search.
export async function loadSuppressionIndex(): Promise<{
  emails: Set<string>;
  domains: Set<string>;
  names: Set<string>;
}> {
  const all = await listSuppressions();
  return {
    emails: new Set(all.map((s) => (s.email ?? '').toLowerCase()).filter(Boolean)),
    domains: new Set(all.map((s) => (s.domain ?? '').toLowerCase()).filter(Boolean)),
    names: new Set(all.map((s) => (s.business_name ?? '').toLowerCase()).filter(Boolean)),
  };
}

export function isSuppressed(
  args: { emails: string[]; domain: string | null; name: string },
  index: { emails: Set<string>; domains: Set<string>; names: Set<string> },
): boolean {
  if (args.emails.some((e) => index.emails.has(e.toLowerCase()))) return true;
  if (args.domain && index.domains.has(args.domain.toLowerCase())) return true;
  if (index.names.has(args.name.toLowerCase())) return true;
  return false;
}
