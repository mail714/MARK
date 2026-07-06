import { NextResponse } from 'next/server';
import { pushProspectsToBook } from '@/lib/chimera/dotdigital-push';
import { startProspectsPush } from '@/lib/chimera/push-search';

// Selections small enough to push within one request run synchronously so
// the UI gets the familiar instant summary; anything bigger becomes a
// bulk job the progress card polls — a 1,500-prospect selection would
// blow straight past the route timeout otherwise.
const SYNC_LIMIT = 100;

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
  const maxEmails =
    typeof body.max_emails_per_prospect === 'number' &&
    Number.isFinite(body.max_emails_per_prospect)
      ? Math.max(1, Math.min(99, Math.floor(body.max_emails_per_prospect)))
      : 1;

  if (ids.length === 0 || !brandId || !addressBookId) {
    return NextResponse.json(
      { error: 'prospect_ids[], brand_id and address_book_id are required' },
      { status: 400 },
    );
  }

  try {
    if (ids.length > SYNC_LIMIT) {
      const jobId = await startProspectsPush({
        prospectIds: ids,
        brandId,
        addressBookId,
        maxEmailsPerProspect: maxEmails,
      });
      return NextResponse.json({ ok: true, job_id: jobId });
    }
    const result = await pushProspectsToBook({
      prospectIds: ids,
      brandId,
      addressBookId,
      maxEmailsPerProspect: maxEmails,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
