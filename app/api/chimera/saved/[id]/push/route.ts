import { NextResponse } from 'next/server';
import { pushSavedSearchToBook } from '@/lib/chimera/saved';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<'/api/chimera/saved/[id]/push'>) {
  const { id } = await ctx.params;
  try {
    const result = await pushSavedSearchToBook(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
