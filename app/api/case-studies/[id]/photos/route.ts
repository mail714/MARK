import { NextResponse } from 'next/server';
import { processPhotosForCaseStudy } from '@/lib/case-study-photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Downloading + resizing + uploading + vision call — give it room.
export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<'/api/case-studies/[id]/photos'>) {
  const { id } = await ctx.params;
  try {
    await processPhotosForCaseStudy(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
