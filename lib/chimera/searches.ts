import { createAdminClient } from '@/lib/supabase/admin';
import type { ChimeraSearch, ChimeraSearchStatus } from './types';

export async function createSearch(args: Partial<ChimeraSearch> & {
  source: ChimeraSearch['source'];
}): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('chimera_searches')
    .insert({
      source: args.source,
      search_mode: args.search_mode ?? 'grid',
      location: args.location ?? null,
      category: args.category ?? null,
      category_label: args.category_label ?? null,
      grid_radius_m: args.grid_radius_m ?? null,
      grid_overlap_pct: args.grid_overlap_pct ?? null,
      max_results: args.max_results ?? null,
      sweep_seeds: args.sweep_seeds ?? [],
      sweep_radius_m: args.sweep_radius_m ?? null,
      apply_chain_filter: args.apply_chain_filter ?? true,
      notes: args.notes ?? null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create search: ${error.message}`);
  return data.id as string;
}

export async function updateSearch(
  id: string,
  patch: Partial<{
    status: ChimeraSearchStatus;
    prospects_found: number;
    prospects_with_email: number;
    prospects_with_website: number;
    chains_skipped: number;
    grid_cells_total: number;
    grid_cells_processed: number;
    started_at: string | null;
    finished_at: string | null;
    last_error: string | null;
  }>,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('chimera_searches').update(patch).eq('id', id);
  if (error) throw new Error(`Failed to update search: ${error.message}`);
}

export async function getSearch(id: string): Promise<ChimeraSearch | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('chimera_searches')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load search: ${error.message}`);
  return (data as ChimeraSearch | null) ?? null;
}

export async function listSearches(): Promise<ChimeraSearch[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('chimera_searches')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list searches: ${error.message}`);
  return (data as ChimeraSearch[]) ?? [];
}
