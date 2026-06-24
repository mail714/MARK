import { NextResponse } from 'next/server';
import { runGiasSync } from '@/lib/gov-uk-schools/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The CSV is ~10MB and ~25k rows. Allow plenty of time for the download +
// parse + chunked upserts.
export const maxDuration = 300;

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
    const result = await runGiasSync(csvOverride);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
