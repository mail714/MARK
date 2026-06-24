import { NextResponse } from 'next/server';
import { createSearch } from '@/lib/chimera/searches';
import {
  runEstateSweepSearch,
  runGooglePlacesSearch,
} from '@/lib/chimera/search-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const mode = body.search_mode === 'estate-sweep' ? 'estate-sweep' : 'grid';
  const categoryLabel =
    typeof body.category_label === 'string' ? body.category_label.trim() : '';

  if (!location || !categoryLabel) {
    return NextResponse.json(
      { error: 'location and category_label are required' },
      { status: 400 },
    );
  }

  try {
    if (mode === 'estate-sweep') {
      const seeds = Array.isArray(body.sweep_seeds)
        ? (body.sweep_seeds as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : [];
      if (seeds.length === 0) {
        return NextResponse.json(
          { error: 'sweep_seeds[] is required for estate-sweep mode' },
          { status: 400 },
        );
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
      });
      setImmediate(() => {
        runEstateSweepSearch(id).catch((err) => {
          console.error('chimera estate-sweep failed', id, err);
        });
      });
      return NextResponse.json({ ok: true, id });
    }

    // grid mode
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    if (!category) {
      return NextResponse.json({ error: 'category is required for grid mode' }, { status: 400 });
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
    });
    setImmediate(() => {
      runGooglePlacesSearch(id).catch((err) => {
        console.error('chimera grid search failed', id, err);
      });
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}
