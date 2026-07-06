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
  // Validate enum/shape fields up front so bad input gets a 400 with a
  // clear message, not a 500 from a Postgres CHECK constraint.
  const STATUSES = new Set(['draft', 'approved', 'scheduled', 'published', 'failed']);
  const PLATFORMS = new Set(['instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest']);
  if (fields.status !== undefined && !STATUSES.has(String(fields.status))) {
    return NextResponse.json({ error: `Invalid status '${fields.status}'` }, { status: 400 });
  }
  if (fields.platform !== undefined && !PLATFORMS.has(String(fields.platform))) {
    return NextResponse.json({ error: `Invalid platform '${fields.platform}'` }, { status: 400 });
  }
  if (fields.hashtags !== undefined && !Array.isArray(fields.hashtags)) {
    return NextResponse.json({ error: 'hashtags must be an array' }, { status: 400 });
  }
  if (fields.media_urls !== undefined && !Array.isArray(fields.media_urls)) {
    return NextResponse.json({ error: 'media_urls must be an array' }, { status: 400 });
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
