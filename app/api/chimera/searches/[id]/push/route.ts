import { NextResponse } from 'next/server';
import { getSearch } from '@/lib/chimera/searches';
import { startSearchPush } from '@/lib/chimera/push-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/chimera/searches/[id]/push'>;

// Kicks off a search-wide push: every with-email prospect in the search,
// across all pages, into the given dotdigital book. Returns a bulk-job id
// the UI polls for progress.
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const search = await getSearch(id);
    if (!search) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as {
      brand_id?: unknown;
      address_book_id?: unknown;
      sector?: unknown;
      max_emails_per_prospect?: unknown;
    };
    const brandId = typeof body.brand_id === 'string' ? body.brand_id : null;
    const addressBookId =
      typeof body.address_book_id === 'number' ? body.address_book_id : null;
    if (!brandId || !addressBookId) {
      return NextResponse.json(
        { error: 'brand_id and address_book_id are required' },
        { status: 400 },
      );
    }
    const maxEmails =
      typeof body.max_emails_per_prospect === 'number' &&
      Number.isFinite(body.max_emails_per_prospect)
        ? Math.max(1, Math.min(99, Math.floor(body.max_emails_per_prospect)))
        : 1;

    const result = await startSearchPush({
      searchId: id,
      brandId,
      addressBookId,
      sector: typeof body.sector === 'string' && body.sector.trim() ? body.sector.trim() : null,
      maxEmailsPerProspect: maxEmails,
    });
    return NextResponse.json({
      job_id: result.jobId,
      to_push: result.toPush,
      already_pushed: result.alreadyPushed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
