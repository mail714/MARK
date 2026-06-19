import { NextResponse } from 'next/server';
import { draftCampaignCopy } from '@/lib/email/draft-orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = RouteContext<'/api/emails/campaigns/[id]/draft'>;

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await draftCampaignCopy(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
