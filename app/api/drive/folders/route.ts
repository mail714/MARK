import { NextResponse } from 'next/server';
import { listPendingFolders } from '@/lib/drive/folders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;
  if (!rootId) {
    return NextResponse.json(
      { error: 'HONOURS_BOARDS_DRIVE_ROOT_ID is not set' },
      { status: 500 },
    );
  }

  try {
    const folders = await listPendingFolders(rootId);
    return NextResponse.json({ folders });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
