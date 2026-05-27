import { getDriveClient } from './client';

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
};

export type PendingFolder = {
  id: string;
  name: string;
  modifiedTime?: string;
  soNumber: string | null;
  customerName: string | null;
  files: {
    salesOrder: DriveFile | null;
    proof: DriveFile | null;
    photos: DriveFile[];
    other: DriveFile[];
  };
};

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SO_REGEX = /^\((\d+)\)\s*(.+)$/;
const IMAGE_MIME_PREFIX = 'image/';
const PDF_MIME = 'application/pdf';

export function parseFolderName(name: string): {
  soNumber: string | null;
  customerName: string | null;
} {
  const match = name.match(SO_REGEX);
  if (!match) return { soNumber: null, customerName: null };
  return { soNumber: match[1], customerName: match[2].trim() };
}

async function findChildFolderByName(
  parentId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const file = res.data.files?.[0];
  return file?.id ? { id: file.id, name: file.name ?? name } : null;
}

async function listChildren(parentId: string): Promise<DriveFile[]> {
  const drive = getDriveClient();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
      pageSize: 200,
      pageToken,
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name || !f.mimeType) continue;
      files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime ?? undefined,
        size: f.size ?? undefined,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

function classifyFiles(children: DriveFile[]): PendingFolder['files'] {
  let salesOrder: DriveFile | null = null;
  let proof: DriveFile | null = null;
  const photos: DriveFile[] = [];
  const other: DriveFile[] = [];

  for (const f of children) {
    if (f.mimeType === FOLDER_MIME) {
      // Photos are typically inside a /photos subfolder — handled separately.
      continue;
    }
    const lower = f.name.toLowerCase();
    if (f.mimeType === PDF_MIME) {
      if (!salesOrder && /(sales[-_ ]?order|^so[-_ ]|so\d)/.test(lower)) {
        salesOrder = f;
        continue;
      }
      if (!proof && /proof/.test(lower)) {
        proof = f;
        continue;
      }
      other.push(f);
      continue;
    }
    if (f.mimeType.startsWith(IMAGE_MIME_PREFIX)) {
      photos.push(f);
      continue;
    }
    other.push(f);
  }
  return { salesOrder, proof, photos, other };
}

export async function listPendingFolders(
  rootFolderId: string,
): Promise<PendingFolder[]> {
  const pending = await findChildFolderByName(rootFolderId, '1-Pending');
  if (!pending) {
    throw new Error(
      "Could not find a '1-Pending' folder under the Honours Boards root. " +
        'Has the service account been granted access to the root folder?',
    );
  }

  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${pending.id}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id, name, modifiedTime)',
    pageSize: 200,
    orderBy: 'name',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const jobFolders = res.data.files ?? [];
  const results: PendingFolder[] = [];

  for (const folder of jobFolders) {
    if (!folder.id || !folder.name) continue;

    const children = await listChildren(folder.id);
    const photosSubfolder = children.find(
      (c) => c.mimeType === FOLDER_MIME && c.name.toLowerCase() === 'photos',
    );

    let photoFiles: DriveFile[] = [];
    if (photosSubfolder) {
      const subChildren = await listChildren(photosSubfolder.id);
      photoFiles = subChildren.filter((c) =>
        c.mimeType.startsWith(IMAGE_MIME_PREFIX),
      );
    }

    const classified = classifyFiles(children);
    classified.photos.push(...photoFiles);

    const { soNumber, customerName } = parseFolderName(folder.name);

    results.push({
      id: folder.id,
      name: folder.name,
      modifiedTime: folder.modifiedTime ?? undefined,
      soNumber,
      customerName,
      files: classified,
    });
  }

  return results;
}
