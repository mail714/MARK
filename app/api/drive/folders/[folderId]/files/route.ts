import { NextResponse } from 'next/server';
import { addFilesToFolder, type UploadedFile } from '@/lib/drive/upload';
import { getFolderContents } from '@/lib/drive/folders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ACCEPTED_MIME = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

type Ctx = RouteContext<'/api/drive/folders/[folderId]/files'>;

export async function GET(_req: Request, ctx: Ctx) {
  const { folderId } = await ctx.params;
  const folder = await getFolderContents(folderId);
  if (!folder) {
    return NextResponse.json({ error: 'Folder not found.' }, { status: 404 });
  }
  return NextResponse.json({
    folder: {
      id: folder.id,
      name: folder.name,
      modifiedTime: folder.modifiedTime,
    },
    files: {
      salesOrder: folder.files.salesOrder,
      proof: folder.files.proof,
      photos: folder.files.photos,
      other: folder.files.other,
    },
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const { folderId } = await ctx.params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Could not parse multipart form data.' }, { status: 400 });
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
    uploaded.push({
      name: item.name,
      mimeType: item.type,
      body: Buffer.from(await item.arrayBuffer()),
    });
  }

  if (uploaded.length === 0) {
    return NextResponse.json({ error: 'No valid files supplied.' }, { status: 400 });
  }

  try {
    const result = await addFilesToFolder({ folderId, files: uploaded });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
