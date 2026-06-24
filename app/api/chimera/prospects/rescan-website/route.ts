import { NextResponse } from 'next/server';
import { startWebsiteRescan } from '@/lib/chimera/rescan-website';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Returns the job id in <1s; the work runs in the background via
// setImmediate and persists progress to bulk_jobs for the UI poller.
export const maxDuration = 30;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const ids = Array.isArray(body.prospect_ids) ? (body.prospect_ids as string[]) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'prospect_ids[] is required' }, { status: 400 });
  }
  try {
    const jobId = await startWebsiteRescan(ids);
    return NextResponse.json({ ok: true, job_id: jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
