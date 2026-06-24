import { NextResponse } from 'next/server';
import { pushProspectsToBook } from '@/lib/chimera/dotdigital-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ids = Array.isArray(body.prospect_ids) ? (body.prospect_ids as string[]) : [];
  const brandId = typeof body.brand_id === 'string' ? body.brand_id : null;
  const addressBookId =
    typeof body.address_book_id === 'number' ? body.address_book_id : null;

  if (ids.length === 0 || !brandId || !addressBookId) {
    return NextResponse.json(
      { error: 'prospect_ids[], brand_id and address_book_id are required' },
      { status: 400 },
    );
  }

  try {
    const result = await pushProspectsToBook({
      prospectIds: ids,
      brandId,
      addressBookId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
