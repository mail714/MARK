import { NextResponse } from 'next/server';
import { updateAddressBookTags } from '@/lib/email/address-books';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/emails/address-books/[id]'>;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: { brand_id?: string | null; sector?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const fields: { brand_id?: string | null; sector?: string | null } = {};
  if ('brand_id' in body) fields.brand_id = body.brand_id || null;
  if ('sector' in body) {
    fields.sector = typeof body.sector === 'string' ? body.sector.trim() || null : null;
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }

  try {
    await updateAddressBookTags(id, fields);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
