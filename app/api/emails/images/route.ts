import { NextResponse } from 'next/server';
import { listEmailImages } from '@/lib/email/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const brandId = url.searchParams.get('brand_id');
  const sector = url.searchParams.get('sector');
  const search = url.searchParams.get('q');
  const page = parseInt(url.searchParams.get('page') ?? '1', 10) || 1;
  const pageSize = parseInt(url.searchParams.get('page_size') ?? '60', 10) || 60;
  try {
    const result = await listEmailImages({
      brandId: brandId || null,
      sector: sector || null,
      search: search || null,
      page,
      pageSize,
    });
    return NextResponse.json({ images: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
