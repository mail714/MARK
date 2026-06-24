import { NextResponse } from 'next/server';
import { deleteSearch, getSearch } from '@/lib/chimera/searches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/chimera/searches/[id]'>;

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const search = await getSearch(id);
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ search });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await deleteSearch(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
