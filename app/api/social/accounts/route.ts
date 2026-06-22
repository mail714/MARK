import { NextResponse } from 'next/server';
import { upsertBrandSocialAccount } from '@/lib/social/accounts';
import type { SocialPlatform } from '@/lib/social/platforms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PLATFORMS: SocialPlatform[] = [
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
  'pinterest',
];

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const brand_id = typeof body.brand_id === 'string' ? body.brand_id : null;
  const platform = typeof body.platform === 'string' ? (body.platform as SocialPlatform) : null;
  if (!brand_id || !platform || !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: 'brand_id and a valid platform are required' }, { status: 400 });
  }

  const norm = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
  };

  try {
    await upsertBrandSocialAccount({
      brand_id,
      platform,
      handle: norm(body.handle),
      profile_url: norm(body.profile_url),
      scheduler_account_id: norm(body.scheduler_account_id),
      notes: norm(body.notes),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
