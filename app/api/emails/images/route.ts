import { NextResponse } from 'next/server';
import { listEmailImages } from '@/lib/email/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const brandId = url.searchParams.get('brand_id');
  const sector = url.searchParams.get('sector');
  try {
    const images = await listEmailImages({
      brandId: brandId || null,
      sector: sector || null,
    });
    return NextResponse.json({ images });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
