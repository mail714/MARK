import { NextResponse } from 'next/server';
import { draftCopyForCaseStudy } from '@/lib/case-studies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Drafting downloads PDFs and calls the model; give it room.
export const maxDuration = 90;

export async function POST(_req: Request, ctx: RouteContext<'/api/case-studies/[id]/draft'>) {
  const { id } = await ctx.params;
  try {
    await draftCopyForCaseStudy(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
