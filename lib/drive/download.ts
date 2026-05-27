import { getDriveClient } from './client';

export async function downloadDriveFile(fileId: string): Promise<Uint8Array> {
  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  return new Uint8Array(res.data as ArrayBuffer);
}
