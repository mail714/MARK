import { NextResponse } from 'next/server';
import { createCaseStudyFolder, type UploadedFile } from '@/lib/drive/upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Uploads can be large (several photos at MBs each). Give it room.
export const maxDuration = 300;

const ACCEPTED_MIME = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per file
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB per request

export async function POST(req: Request) {
  const rootFolderId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;
  if (!rootFolderId) {
    return NextResponse.json(
      { error: 'HONOURS_BOARDS_DRIVE_ROOT_ID is not set' },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Could not parse multipart form data.' }, { status: 400 });
  }

  const folderName = String(form.get('folderName') ?? '').trim();
  if (!folderName) {
    return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 });
  }

  const incoming = form.getAll('files');
  if (incoming.length === 0) {
    return NextResponse.json({ error: 'At least one file is required.' }, { status: 400 });
  }

  const uploaded: UploadedFile[] = [];
  let totalBytes = 0;
  for (const item of incoming) {
    if (!(item instanceof File)) continue;
    if (item.size === 0) continue;
    if (!ACCEPTED_MIME.test(item.type)) {
      return NextResponse.json(
        { error: `Unsupported file type "${item.type}" for ${item.name}.` },
        { status: 400 },
      );
    }
    if (item.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${item.name} is over the per-file 50 MB limit.` },
        { status: 413 },
      );
    }
    totalBytes += item.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: 'Upload exceeds 200 MB combined. Try a smaller batch.' },
        { status: 413 },
      );
    }
    const buf = Buffer.from(await item.arrayBuffer());
    uploaded.push({ name: item.name, mimeType: item.type, body: buf });
  }

  if (uploaded.length === 0) {
    return NextResponse.json({ error: 'No valid files supplied.' }, { status: 400 });
  }

  try {
    const result = await createCaseStudyFolder({
      rootFolderId,
      folderName,
      files: uploaded,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /already exists/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
