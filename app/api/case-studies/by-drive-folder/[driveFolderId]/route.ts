import { NextResponse } from 'next/server';
import { deleteByDriveFolderId } from '@/lib/case-studies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  ctx: RouteContext<'/api/case-studies/by-drive-folder/[driveFolderId]'>,
) {
  const { driveFolderId } = await ctx.params;
  try {
    const result = await deleteByDriveFolderId(driveFolderId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
