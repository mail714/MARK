import { createSearch } from './searches';
import {
  runEstateSweepSearch,
  runGooglePlacesSearch,
} from './search-orchestrator';
import { runGovUkSchoolsSearch } from './sources/gov-uk-schools';

export type DispatchResult = { ok: true; id: string } | { ok: false; error: string };

// Turns a search payload (as POSTed to /api/chimera/searches) into a new
// chimera_searches row + a backgrounded run. Shared between the public
// search-create endpoint and the saved-search 'Run now' endpoint so both
// behave identically.
export async function dispatchSearch(
  body: Record<string, unknown>,
  opts: { saved_search_id?: string | null } = {},
): Promise<DispatchResult> {
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const mode =
    body.search_mode === 'estate-sweep'
      ? 'estate-sweep'
      : body.search_mode === 'gov-uk-schools'
        ? 'gov-uk-schools'
        : 'grid';
  const categoryLabel =
    typeof body.category_label === 'string' ? body.category_label.trim() : '';
  if (!location || !categoryLabel) {
    return { ok: false, error: 'location and category_label are required' };
  }

  try {
    if (mode === 'gov-uk-schools') {
      const phase =
        typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null;
      const id = await createSearch({
        source: 'gov-uk-schools',
        search_mode: 'gov-uk-schools',
        location,
        category: phase,
        category_label: categoryLabel,
        max_results: clampInt(body.max_results, 10, 5000, 500),
        apply_chain_filter: false,
        notes: typeof body.notes === 'string' ? body.notes : null,
        saved_search_id: opts.saved_search_id ?? null,
        original_payload: body,
      });
      setImmediate(() => {
        runGovUkSchoolsSearch(id).catch((err) => {
          console.error('chimera schools search failed', id, err);
        });
      });
      return { ok: true, id };
    }

    if (mode === 'estate-sweep') {
      const seeds = Array.isArray(body.sweep_seeds)
        ? (body.sweep_seeds as unknown[]).filter(
            (s): s is string => typeof s === 'string' && s.trim().length > 0,
          )
        : [];
      if (seeds.length === 0) {
        return { ok: false, error: 'sweep_seeds[] is required for estate-sweep mode' };
      }
      const id = await createSearch({
        source: 'google-places',
        search_mode: 'estate-sweep',
        location,
        category_label: categoryLabel,
        sweep_seeds: seeds,
        sweep_radius_m: clampInt(body.sweep_radius_m, 100, 2000, 400),
        max_results: clampInt(body.max_results, 10, 5000, 500),
        pull_companies_house: body.pull_companies_house === true,
        apply_chain_filter: body.apply_chain_filter === true,
        notes: typeof body.notes === 'string' ? body.notes : null,
        saved_search_id: opts.saved_search_id ?? null,
        original_payload: body,
      });
      setImmediate(() => {
        runEstateSweepSearch(id).catch((err) => {
          console.error('chimera estate-sweep failed', id, err);
        });
      });
      return { ok: true, id };
    }

    // grid mode
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    if (!category) {
      return { ok: false, error: 'category is required for grid mode' };
    }
    const id = await createSearch({
      source: 'google-places',
      search_mode: 'grid',
      location,
      category,
      category_label: categoryLabel,
      grid_radius_m: clampInt(body.grid_radius_m, 500, 20_000, 1500),
      grid_overlap_pct: clampInt(body.grid_overlap_pct, 0, 80, 40),
      max_results: clampInt(body.max_results, 10, 5_000, 500),
      apply_chain_filter: body.apply_chain_filter !== false,
      notes: typeof body.notes === 'string' ? body.notes : null,
      saved_search_id: opts.saved_search_id ?? null,
      original_payload: body,
    });
    setImmediate(() => {
      runGooglePlacesSearch(id).catch((err) => {
        console.error('chimera grid search failed', id, err);
      });
    });
    return { ok: true, id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}
