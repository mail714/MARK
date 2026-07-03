import { NextResponse } from 'next/server';
import { getSearch, updateSearch } from '@/lib/chimera/searches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/chimera/searches/[id]/fail'>;

// Marks a stalled search as failed. Search runs execute in-process on the
// web server, so a deploy or restart mid-run kills them silently and the
// row stays 'running' forever. The operator confirms the stall from the
// progress card (no activity for 10+ minutes) and this closes it out —
// a Run again then fast-forwards through everything already processed.
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const search = await getSearch(id);
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (search.status !== 'running' && search.status !== 'pending') {
      return NextResponse.json(
        { error: `Search is ${search.status} — only running searches can be marked failed` },
        { status: 400 },
      );
    }
    await updateSearch(id, {
      status: 'failed',
      last_error: 'Marked as stalled — the run stopped updating (likely a server restart mid-run). Use Run again to resume; already-processed businesses are skipped for free.',
      finished_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
