import { NextResponse } from 'next/server';
import { bulkAssignProspects } from '@/lib/chimera/prospects';
import type { ProspectAssignmentStatus } from '@/lib/chimera/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES: ProspectAssignmentStatus[] = ['new', 'approved', 'pushed', 'skipped'];

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ids = Array.isArray(body.prospect_ids) ? (body.prospect_ids as string[]) : [];
  const brandId = typeof body.brand_id === 'string' ? body.brand_id : null;
  const sector = typeof body.sector === 'string' ? body.sector : null;
  const status = typeof body.status === 'string' ? (body.status as ProspectAssignmentStatus) : 'new';

  if (ids.length === 0 || !brandId || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: 'prospect_ids[], brand_id and a valid status are required' },
      { status: 400 },
    );
  }

  try {
    await bulkAssignProspects(ids, { brand_id: brandId, sector, status });
    return NextResponse.json({ ok: true, count: ids.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
