import { NextResponse } from 'next/server';
import { getBulkJob, reapZombieJobs } from '@/lib/chimera/bulk-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: RouteContext<'/api/chimera/jobs/[id]'>) {
  const { id } = await ctx.params;
  try {
    // Catch zombie jobs from previous worker deaths so the UI doesn't poll
    // forever waiting for one that died.
    await reapZombieJobs();
    const job = await getBulkJob(id);
    if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
