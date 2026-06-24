import { NextResponse } from 'next/server';
import { startGiasSyncAsync } from '@/lib/gov-uk-schools/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Just creates the sync row and kicks off the work — returns in well under
// a second. The work continues via setImmediate after the response is sent.
// UI polls /api/chimera/sources/schools/status for progress.
export const maxDuration = 30;

export async function POST(req: Request) {
  let csvOverride: string | undefined;
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body === 'object' && typeof (body as { csv?: unknown }).csv === 'string') {
      csvOverride = (body as { csv: string }).csv;
    }
  } catch {
    // no body, auto-fetch
  }
  try {
    const syncId = await startGiasSyncAsync(csvOverride);
    return NextResponse.json({ ok: true, syncId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
