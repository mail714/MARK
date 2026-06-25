import { NextResponse } from 'next/server';
import { startEmailVerification } from '@/lib/chimera/verify-emails';
import { isZeroBounceConfigured } from '@/lib/zerobounce/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!isZeroBounceConfigured()) {
    return NextResponse.json(
      { error: 'ZEROBOUNCE_API_KEY is not set on the server' },
      { status: 400 },
    );
  }
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
    const jobId = await startEmailVerification(ids);
    return NextResponse.json({ ok: true, job_id: jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
