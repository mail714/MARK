import { NextResponse } from 'next/server';
import { startGiasSyncAsync } from '@/lib/gov-uk-schools/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  let csvOverride: string | undefined;
  let sourceUrlOverride: string | undefined;
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body === 'object') {
      if (typeof (body as { csv?: unknown }).csv === 'string') {
        csvOverride = (body as { csv: string }).csv;
      }
      if (typeof (body as { source_url?: unknown }).source_url === 'string') {
        const u = (body as { source_url: string }).source_url.trim();
        if (u) sourceUrlOverride = u;
      }
    }
  } catch {
    // no body, auto-fetch
  }
  try {
    const syncId = await startGiasSyncAsync({ csvOverride, sourceUrlOverride });
    return NextResponse.json({ ok: true, syncId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
