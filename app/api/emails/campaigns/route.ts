import { NextResponse } from 'next/server';
import { createCampaign } from '@/lib/email/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { internal_name?: string; brand_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const internal_name = (body.internal_name ?? '').trim();
  if (!internal_name) {
    return NextResponse.json({ error: 'internal_name is required.' }, { status: 400 });
  }
  try {
    const id = await createCampaign({ internal_name, brand_id: body.brand_id ?? null });
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
