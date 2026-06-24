import { NextResponse } from 'next/server';
import { createSearch } from '@/lib/chimera/searches';
import { runGooglePlacesSearch } from '@/lib/chimera/search-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Search can run for many minutes — we kick off the work in the background
// (unawaited promise) and return immediately so the UI can poll status.
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const categoryLabel =
    typeof body.category_label === 'string' ? body.category_label.trim() : category;
  if (!location || !category) {
    return NextResponse.json({ error: 'location and category are required' }, { status: 400 });
  }

  try {
    const id = await createSearch({
      source: 'google-places',
      location,
      category,
      category_label: categoryLabel,
      grid_radius_m: clampInt(body.grid_radius_m, 500, 20_000, 1500),
      grid_overlap_pct: clampInt(body.grid_overlap_pct, 0, 80, 40),
      max_results: clampInt(body.max_results, 10, 5_000, 500),
      apply_chain_filter: body.apply_chain_filter !== false,
      notes: typeof body.notes === 'string' ? body.notes : null,
    });

    // Fire and forget — the long-running search executes after the response
    // is sent. Errors are persisted to the search row (status='failed').
    setImmediate(() => {
      runGooglePlacesSearch(id).catch((err) => {
        console.error('chimera search failed', id, err);
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
