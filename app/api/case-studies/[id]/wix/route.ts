import { NextResponse } from 'next/server';
import { resetWixLink } from '@/lib/case-studies-publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: RouteContext<'/api/case-studies/[id]/wix'>) {
  const { id } = await ctx.params;
  try {
    const result = await resetWixLink(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
