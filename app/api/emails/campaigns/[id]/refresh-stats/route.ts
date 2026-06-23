import { NextResponse } from 'next/server';
import { refreshCampaignStats } from '@/lib/email/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, ctx: RouteContext<'/api/emails/campaigns/[id]/refresh-stats'>) {
  const { id } = await ctx.params;
  try {
    const stats = await refreshCampaignStats(id);
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
