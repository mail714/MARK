import { NextResponse } from 'next/server';
import { publishCaseStudy } from '@/lib/case-studies-publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Image uploads + polling + CMS write — give it room.
export const maxDuration = 120;

export async function POST(_req: Request, ctx: RouteContext<'/api/case-studies/[id]/publish'>) {
  const { id } = await ctx.params;
  try {
    const result = await publishCaseStudy(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
