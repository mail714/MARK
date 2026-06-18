import { Readable } from 'node:stream';
import { getDriveClient } from './client';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function findChildFolderByName(
  parentId: string,
  name: string,
): Promise<string | null> {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function createFolder(parentId: string, name: string): Promise<string> {
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error(`Drive folder creation returned no id for ${name}`);
  return res.data.id;
}

async function uploadFileToFolder(args: {
  parentId: string;
  name: string;
  mimeType: string;
  body: Buffer;
}): Promise<string> {
  const drive = getDriveClient();
  const res = await drive.files.create({
    requestBody: { name: args.name, parents: [args.parentId] },
    media: { mimeType: args.mimeType, body: Readable.from(args.body) },
    fields: 'id, name',
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error(`Drive upload returned no id for ${args.name}`);
  return res.data.id;
}

export type UploadedFile = {
  name: string;
  mimeType: string;
  body: Buffer;
};

export type CreateCaseStudyFolderResult = {
  folderId: string;
  folderName: string;
  pdfIds: string[];
  photoIds: string[];
};

// Add files to an existing job folder. PDFs go to the folder root; images go
// to a 'photos' subfolder (created if it doesn't exist yet).
export async function addFilesToFolder(args: {
  folderId: string;
  files: UploadedFile[];
}): Promise<{ pdfIds: string[]; photoIds: string[] }> {
  const drive = getDriveClient();
  const meta = await drive.files.get({
    fileId: args.folderId,
    fields: 'id, name, mimeType, trashed',
    supportsAllDrives: true,
  }).catch(() => null);
  if (!meta?.data?.id || meta.data.trashed) {
    throw new Error(`Folder ${args.folderId} not found.`);
  }
  if (meta.data.mimeType !== FOLDER_MIME) {
    throw new Error(`${args.folderId} is not a folder.`);
  }

  const pdfs = args.files.filter((f) => f.mimeType === 'application/pdf');
  const photos = args.files.filter((f) => f.mimeType.startsWith('image/'));

  const pdfIds: string[] = [];
  for (const pdf of pdfs) {
    pdfIds.push(await uploadFileToFolder({
      parentId: args.folderId,
      name: pdf.name,
      mimeType: pdf.mimeType,
      body: pdf.body,
    }));
  }

  let photoIds: string[] = [];
  if (photos.length > 0) {
    let photosFolderId = await findChildFolderByName(args.folderId, 'photos');
    if (!photosFolderId) {
      photosFolderId = await createFolder(args.folderId, 'photos');
    }
    for (const photo of photos) {
      photoIds.push(await uploadFileToFolder({
        parentId: photosFolderId,
        name: photo.name,
        mimeType: photo.mimeType,
        body: photo.body,
      }));
    }
  }

  return { pdfIds, photoIds };
}
export async function createCaseStudyFolder(args: {
  rootFolderId: string;
  folderName: string;
  files: UploadedFile[];
}): Promise<CreateCaseStudyFolderResult> {
  const pendingId = await findChildFolderByName(args.rootFolderId, '1-Pending');
  if (!pendingId) {
    throw new Error("Could not find '1-Pending' under the case-studies root.");
  }

  const trimmedName = args.folderName.trim();
  if (!trimmedName) throw new Error('Folder name is required.');

  // Refuse silently to create a duplicate.
  const existing = await findChildFolderByName(pendingId, trimmedName);
  if (existing) {
    throw new Error(`A folder named "${trimmedName}" already exists in 1-Pending.`);
  }

  const folderId = await createFolder(pendingId, trimmedName);

  const pdfs = args.files.filter((f) => f.mimeType === 'application/pdf');
  const photos = args.files.filter((f) => f.mimeType.startsWith('image/'));

  const pdfIds: string[] = [];
  for (const pdf of pdfs) {
    pdfIds.push(await uploadFileToFolder({
      parentId: folderId,
      name: pdf.name,
      mimeType: pdf.mimeType,
      body: pdf.body,
    }));
  }

  let photoIds: string[] = [];
  if (photos.length > 0) {
    const photosFolderId = await createFolder(folderId, 'photos');
    for (const photo of photos) {
      photoIds.push(await uploadFileToFolder({
        parentId: photosFolderId,
        name: photo.name,
        mimeType: photo.mimeType,
        body: photo.body,
      }));
    }
  }

  return { folderId, folderName: trimmedName, pdfIds, photoIds };
}
