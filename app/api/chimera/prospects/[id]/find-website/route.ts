import { NextResponse } from 'next/server';
import { findWebsiteForProspect } from '@/lib/chimera/find-website';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(_req: Request, ctx: RouteContext<'/api/chimera/prospects/[id]/find-website'>) {
  const { id } = await ctx.params;
  try {
    const result = await findWebsiteForProspect(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
