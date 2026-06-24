import { NextResponse } from 'next/server';
import { createSavedSearch, listSavedSearches } from '@/lib/chimera/saved';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const items = await listSavedSearches();
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const brand_id = typeof body.brand_id === 'string' ? body.brand_id : '';
  const payload = body.payload && typeof body.payload === 'object'
    ? (body.payload as Record<string, unknown>)
    : null;
  if (!name || !brand_id || !payload) {
    return NextResponse.json(
      { error: 'name, brand_id and payload are required' },
      { status: 400 },
    );
  }
  try {
    const id = await createSavedSearch({
      name,
      description: typeof body.description === 'string' ? body.description : null,
      payload,
      brand_id,
      sector: typeof body.sector === 'string' && body.sector.trim() ? body.sector.trim() : null,
      dotdigital_book_id:
        typeof body.dotdigital_book_id === 'number' ? body.dotdigital_book_id : null,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
