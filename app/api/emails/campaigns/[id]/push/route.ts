import { NextResponse } from 'next/server';
import { pushCampaignToDotdigital } from '@/lib/email/push-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = RouteContext<'/api/emails/campaigns/[id]/push'>;

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const result = await pushCampaignToDotdigital(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
