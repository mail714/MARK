import { getDriveClient } from './client';

// Trash a folder (and its contents — Drive cascades). Goes to Drive trash, not
// permanently deleted, so the operator can restore from trash within 30 days.
export async function trashFolder(folderId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.update({
    fileId: folderId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });
}
