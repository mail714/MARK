import { NextResponse } from 'next/server';
import { getSavedSearch, recordSavedRun } from '@/lib/chimera/saved';
import { dispatchSearch } from '@/lib/chimera/search-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: RouteContext<'/api/chimera/saved/[id]/run'>) {
  const { id } = await ctx.params;
  const saved = await getSavedSearch(id);
  if (!saved) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await dispatchSearch(saved.payload, { saved_search_id: saved.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Mark this run as the saved search's latest. last_run_prospects is
  // backfilled later by the orchestrator as the search progresses; we
  // record it as 0 here so the UI shows 'running'.
  await recordSavedRun({
    saved_search_id: saved.id,
    search_id: result.id,
    prospects: 0,
  });

  return NextResponse.json({ ok: true, id: result.id });
}
