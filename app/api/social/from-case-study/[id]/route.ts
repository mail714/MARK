import { NextResponse } from 'next/server';
import { generateSocialPostsFromCaseStudy } from '@/lib/social/draft-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(_req: Request, ctx: RouteContext<'/api/social/from-case-study/[id]'>) {
  const { id } = await ctx.params;
  try {
    const result = await generateSocialPostsFromCaseStudy(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
