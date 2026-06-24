import { NextResponse } from 'next/server';
import { rescanWebsitesForProspects } from '@/lib/chimera/rescan-website';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
    const result = await rescanWebsitesForProspects({ prospectIds: ids });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
