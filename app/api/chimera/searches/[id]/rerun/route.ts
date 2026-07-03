import { NextResponse } from 'next/server';
import { getSearch } from '@/lib/chimera/searches';
import { dispatchSearch } from '@/lib/chimera/search-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/chimera/searches/[id]/rerun'>;

// Re-runs a search with the same criteria as a NEW search row, optionally
// overriding max_results so a capped run can be widened. Businesses already
// in the database are linked for free (no place-details / scrape spend) —
// only genuinely new discoveries cost money.
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const search = await getSearch(id);
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const payload = search.original_payload as Record<string, unknown> | null;
    if (!payload) {
      return NextResponse.json(
        {
          error:
            'This search has no stored criteria (created before re-runs existed) — start it from the New search form instead.',
        },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { max_results?: unknown };
    const override =
      typeof body.max_results === 'number' && Number.isFinite(body.max_results)
        ? Math.max(10, Math.min(5000, Math.floor(body.max_results)))
        : null;

    const result = await dispatchSearch(
      { ...payload, ...(override !== null ? { max_results: override } : {}) },
      { saved_search_id: search.saved_search_id ?? null },
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ id: result.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
