import { NextResponse } from 'next/server';
import { deleteSavedSearch, updateSavedSearch } from '@/lib/chimera/saved';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/chimera/saved/[id]'>;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = body.name.trim();
  if (typeof body.description === 'string' || body.description === null) patch.description = body.description;
  if (typeof body.sector === 'string' || body.sector === null) patch.sector = body.sector;
  if (typeof body.dotdigital_book_id === 'number' || body.dotdigital_book_id === null) {
    patch.dotdigital_book_id = body.dotdigital_book_id;
  }
  if (typeof body.brand_id === 'string') patch.brand_id = body.brand_id;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }
  try {
    await updateSavedSearch(id, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await deleteSavedSearch(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
