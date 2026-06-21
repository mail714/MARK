import { NextResponse } from 'next/server';
import { deleteCampaign, updateCampaign, type EmailCampaign } from '@/lib/email/campaigns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/emails/campaigns/[id]'>;

const EDITABLE_FIELDS = [
  'internal_name',
  'sector',
  'campaign_type',
  'intent',
  'address_book_ids',
  'template_key',
  'subject',
  'preheader',
  'html_body',
  'hero_image_url',
  'hero_image_alt',
  'brand_id',
  'status',
] as const;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fields: Partial<EmailCampaign> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in body) (fields as Record<string, unknown>)[k] = body[k];
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }
  try {
    await updateCampaign(id, fields);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await deleteCampaign(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
