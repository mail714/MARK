import { NextResponse } from 'next/server';
import { generateSocialPostsFromEmailCampaign } from '@/lib/social/draft-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(_req: Request, ctx: RouteContext<'/api/social/from-email/[id]'>) {
  const { id } = await ctx.params;
  try {
    const result = await generateSocialPostsFromEmailCampaign(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
