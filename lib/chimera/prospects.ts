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

  // Brand / status filters must run server-side, BEFORE pagination —
  // filtering the fetched page in JS silently hides matches beyond the
  // page boundary and reports the unfiltered count as the total. An inner
  // join on the assignments embed pushes the condition into the query;
  // 'unassigned' filters on the left-joined embed being empty.
  const wantsAssignmentJoin =
    (!!filters.brandId || !!filters.status) && filters.status !== 'unassigned';
  const assignmentsEmbed = wantsAssignmentJoin
    ? 'prospect_brand_assignments!inner(*)'
    : 'prospect_brand_assignments(*)';

  let query = supabase
    .from('prospects')
    .select(
      `*, ${assignmentsEmbed}, prospect_searches!inner(search_id)`,
      { count: 'exact' },
    )
    .order('first_found_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.searchId) {
    query = query.eq('prospect_searches.search_id', filters.searchId);
  }
  if (filters.brandId && filters.status !== 'unassigned') {
    query = query.eq('prospect_brand_assignments.brand_id', filters.brandId);
  }
  if (filters.status && filters.status !== 'unassigned') {
    query = query.eq('prospect_brand_assignments.status', filters.status);
  }
  if (filters.status === 'unassigned') {
    query = query.is('prospect_brand_assignments', null);
  }
  if (filters.withEmail) {
    query = query.not('emails', 'eq', '{}');
  }
  if (filters.search) {
    // Commas and parens are PostgREST or-tree syntax and can't be
    // backslash-escaped — strip them from the needle instead of 500ing.
    const safe = filters.search.replace(/[,()]/g, ' ').replace(/[%_]/g, (c) => `\\${c}`).trim();
    if (safe) {
      query = query.or(
        `business_name.ilike.%${safe}%,website_domain.ilike.%${safe}%,postcode.ilike.%${safe}%`,
      );
    }
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list prospects: ${error.message}`);

  let items = ((data ?? []) as (Prospect & {
    prospect_brand_assignments: ProspectBrandAssignment[];
  })[]).map((p) => ({
    ...p,
    assignments: p.prospect_brand_assignments ?? [],
  }));

  // Belt-and-braces re-check in JS (cheap, and keeps behaviour identical
  // if the embedded filter semantics ever shift under a PostgREST upgrade).
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

// Assignment step for automated bulk pushes. Unlike bulkAssignProspects
// (the operator's explicit Assign button, which overwrites), this only
// CREATES missing assignments and never touches existing rows — a
// prospect the operator marked 'skipped' must stay skipped, and one
// already 'pushed' mustn't regress to 'approved'. Returns the ids whose
// assignment for this brand is 'skipped' so callers exclude them from
// the push entirely.
export async function ensureAssignmentsForPush(
  ids: string[],
  args: { brand_id: string; sector: string | null },
): Promise<Set<string>> {
  const skipped = new Set<string>();
  if (ids.length === 0) return skipped;
  const supabase = createAdminClient();

  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await supabase
      .from('prospect_brand_assignments')
      .select('prospect_id, status')
      .in('prospect_id', chunk)
      .eq('brand_id', args.brand_id);
    if (error) throw new Error(`Failed to load assignments: ${error.message}`);
    for (const r of (data ?? []) as { prospect_id: string; status: string }[]) {
      existing.add(r.prospect_id);
      if (r.status === 'skipped') skipped.add(r.prospect_id);
    }
  }

  const missing = ids.filter((id) => !existing.has(id));
  for (let i = 0; i < missing.length; i += 500) {
    const rows = missing.slice(i, i + 500).map((id) => ({
      prospect_id: id,
      brand_id: args.brand_id,
      sector: args.sector,
      status: 'approved' as const,
    }));
    const { error } = await supabase
      .from('prospect_brand_assignments')
      .upsert(rows, { onConflict: 'prospect_id,brand_id', ignoreDuplicates: true });
    if (error) throw new Error(`Failed to assign prospects: ${error.message}`);
  }
  return skipped;
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
