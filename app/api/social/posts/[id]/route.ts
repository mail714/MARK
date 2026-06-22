import { NextResponse } from 'next/server';
import { deleteSocialPost, updateSocialPost, type SocialPost } from '@/lib/social/posts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/social/posts/[id]'>;

const EDITABLE_FIELDS = [
  'brand_id',
  'status',
  'platform',
  'sector',
  'internal_name',
  'caption',
  'hashtags',
  'media_urls',
  'media_alts',
  'media_kind',
  'shot_brief',
  'cta_url',
  'planned_publish_at',
] as const;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fields: Partial<SocialPost> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in body) (fields as Record<string, unknown>)[k] = body[k];
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }
  try {
    await updateSocialPost(id, fields);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await deleteSocialPost(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
