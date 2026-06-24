import { NextResponse } from 'next/server';
import { deleteSuppression } from '@/lib/chimera/prospects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: RouteContext<'/api/chimera/suppressions/[id]'>) {
  const { id } = await ctx.params;
  try {
    await deleteSuppression(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
