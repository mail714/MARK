import { NextResponse } from 'next/server';
import { trashFile } from '@/lib/drive/delete';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  ctx: RouteContext<'/api/drive/folders/[folderId]/files/[fileId]'>,
) {
  const { fileId } = await ctx.params;
  try {
    await trashFile(fileId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
