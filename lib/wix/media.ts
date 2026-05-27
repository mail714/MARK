import { wix } from './client';

type FileDescriptor = {
  id: string;
  displayName: string;
  url: string;
  mediaType?: string;
  operationStatus: 'PENDING' | 'READY' | 'FAILED';
  media?: {
    image?: {
      image?: {
        id: string;
        url: string;
        width: number;
        height: number;
        altText?: string;
        filename: string;
      };
    };
  };
};

type ImportFileResponse = { file: FileDescriptor };
type GetFileResponse = { file: FileDescriptor };

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

async function pollUntilReady(fileId: string): Promise<FileDescriptor> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await wix.get<GetFileResponse>(
      `https://www.wixapis.com/site-media/v1/files/get-file-by-id?fileId=${encodeURIComponent(fileId)}`,
    );
    if (res.file.operationStatus === 'READY') return res.file;
    if (res.file.operationStatus === 'FAILED') {
      throw new Error(`Wix media import failed for file ${fileId}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Wix media import timed out for file ${fileId}`);
}

export type WixUploadedImage = {
  fileId: string;
  imageId: string;
  width: number;
  height: number;
  filename: string;
  // wix:image URI to use in CMS image fields
  wixImageUri: string;
};

// Imports a publicly-accessible image URL into the Wix Media Manager and waits
// for it to be ready. Returns the wix:image URI to drop into a CMS image field.
export async function importImageFromUrl(args: {
  url: string;
  displayName: string;
  parentFolderPath?: string;
}): Promise<WixUploadedImage> {
  const imported = await wix.post<ImportFileResponse>(
    'https://www.wixapis.com/site-media/v1/files/import',
    {
      url: args.url,
      displayName: args.displayName,
      mimeType: 'image/jpeg',
      mediaType: 'IMAGE',
      filePath: args.parentFolderPath ?? '/case-studies-mark',
    },
  );

  const ready = await pollUntilReady(imported.file.id);
  const image = ready.media?.image?.image;
  if (!image) {
    throw new Error(`Wix import succeeded but no image media returned for ${imported.file.id}`);
  }
  const wixImageUri = `wix:image://v1/${image.id}/${encodeURIComponent(image.filename)}#originWidth=${image.width}&originHeight=${image.height}`;
  return {
    fileId: ready.id,
    imageId: image.id,
    width: image.width,
    height: image.height,
    filename: image.filename,
    wixImageUri,
  };
}
