import { createAdminClient } from '@/lib/supabase/admin';
import { pushProspectsToBook } from './dotdigital-push';
import { ensureAssignmentsForPush } from './prospects';

export type SavedSearch = {
  id: string;
  name: string;
  description: string | null;
  payload: Record<string, unknown>;
  brand_id: string;
  sector: string | null;
  dotdigital_book_id: number | null;
  last_run_search_id: string | null;
  last_run_at: string | null;
  last_run_prospects: number | null;
  created_at: string;
  updated_at: string;
};

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to list saved searches: ${error.message}`);
  return (data as SavedSearch[]) ?? [];
}

export async function getSavedSearch(id: string): Promise<SavedSearch | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load saved search: ${error.message}`);
  return (data as SavedSearch | null) ?? null;
}

export async function createSavedSearch(args: {
  name: string;
  description?: string | null;
  payload: Record<string, unknown>;
  brand_id: string;
  sector?: string | null;
  dotdigital_book_id?: number | null;
}): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      name: args.name.trim(),
      description: args.description ?? null,
      payload: args.payload,
      brand_id: args.brand_id,
      sector: args.sector ?? null,
      dotdigital_book_id: args.dotdigital_book_id ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create saved search: ${error.message}`);
  return data.id as string;
}

export async function updateSavedSearch(
  id: string,
  patch: Partial<
    Pick<SavedSearch, 'name' | 'description' | 'sector' | 'dotdigital_book_id' | 'brand_id'>
  >,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('saved_searches').update(patch).eq('id', id);
  if (error) throw new Error(`Failed to update saved search: ${error.message}`);
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete saved search: ${error.message}`);
}

// Marks the saved search's latest run so the list view can show it.
export async function recordSavedRun(args: {
  saved_search_id: string;
  search_id: string;
  prospects: number;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('saved_searches')
    .update({
      last_run_search_id: args.search_id,
      last_run_at: new Date().toISOString(),
      last_run_prospects: args.prospects,
    })
    .eq('id', args.saved_search_id);
  if (error) throw new Error(`Failed to record saved run: ${error.message}`);
}

// Pushes every prospect from the saved search's latest run into the bound
// dotdigital book. Skips prospects already pushed to this book (we look at
// pushed_to_dotdigital_book_id on prospect_brand_assignments) so re-runs
// are idempotent and the book grows additively.
export async function pushSavedSearchToBook(
  savedSearchId: string,
): Promise<{ pushed: number; skipped: number; failed: number; assigned: number }> {
  const saved = await getSavedSearch(savedSearchId);
  if (!saved) throw new Error(`Saved search ${savedSearchId} not found`);
  if (!saved.dotdigital_book_id) {
    throw new Error('No dotdigital book bound to this saved search');
  }
  if (!saved.last_run_search_id) {
    throw new Error('Saved search has no runs yet — run it first');
  }

  const supabase = createAdminClient();

  // 1. Every prospect from the latest run — paged, because PostgREST caps
  // a single response at 1,000 rows and big sweeps exceed that (an
  // unpaged read would silently sync only the first thousand).
  const prospectIds: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: links, error: linksErr } = await supabase
      .from('prospect_searches')
      .select('prospect_id')
      .eq('search_id', saved.last_run_search_id)
      .range(from, from + 999);
    if (linksErr) throw new Error(`Failed to load run prospects: ${linksErr.message}`);
    const rows = (links ?? []) as { prospect_id: string }[];
    prospectIds.push(...rows.map((r) => r.prospect_id));
    if (rows.length < 1000) break;
  }
  if (prospectIds.length === 0) return { pushed: 0, skipped: 0, failed: 0, assigned: 0 };

  // 2. Create missing brand assignments without overwriting existing ones,
  // and respect prospects the operator marked Skip for this brand.
  const skippedByOperator = await ensureAssignmentsForPush(prospectIds, {
    brand_id: saved.brand_id,
    sector: saved.sector,
  });
  const assigned = prospectIds.length - skippedByOperator.size;

  // 3. Filter out prospects already pushed to this exact book (chunked —
  // .in() with 1,500 uuids overruns URL limits) plus operator skips.
  const alreadyPushed = new Set<string>();
  for (let i = 0; i < prospectIds.length; i += 200) {
    const chunk = prospectIds.slice(i, i + 200);
    const { data: existingPushes } = await supabase
      .from('prospect_brand_assignments')
      .select('prospect_id')
      .in('prospect_id', chunk)
      .eq('brand_id', saved.brand_id)
      .eq('pushed_to_dotdigital_book_id', saved.dotdigital_book_id);
    for (const r of (existingPushes ?? []) as { prospect_id: string }[]) {
      alreadyPushed.add(r.prospect_id);
    }
  }
  const toPush = prospectIds.filter(
    (id) => !alreadyPushed.has(id) && !skippedByOperator.has(id),
  );
  const skipped = alreadyPushed.size + skippedByOperator.size;

  if (toPush.length === 0) {
    return { pushed: 0, skipped, failed: 0, assigned };
  }

  // 4. Push the rest. pushProspectsToBook handles the email/no-email split.
  const result = await pushProspectsToBook({
    prospectIds: toPush,
    brandId: saved.brand_id,
    addressBookId: saved.dotdigital_book_id,
  });

  return {
    pushed: result.pushed,
    skipped: skipped + result.skipped,
    failed: result.failed,
    assigned,
  };
}
