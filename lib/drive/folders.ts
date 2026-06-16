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

  // Fallback: if one of sales-order / proof was identified by filename and
  // exactly one other PDF sits in the folder, treat it as the missing pair.
  // Covers folders where the proof is named after the SO number or job, with
  // no "proof" keyword in the filename.
  const orphanPdfs = other.filter((f) => f.mimeType === PDF_MIME);
  if (orphanPdfs.length === 1) {
    if (salesOrder && !proof) {
      proof = orphanPdfs[0];
      other.splice(other.indexOf(orphanPdfs[0]), 1);
    } else if (proof && !salesOrder) {
      salesOrder = orphanPdfs[0];
      other.splice(other.indexOf(orphanPdfs[0]), 1);
    }
  }

  return { salesOrder, proof, photos, other };
}

// Build the PendingFolder view (files classified by role + photos pulled in
// from the /photos subfolder) for any job folder by ID — does not care which
// segment it currently sits under, so it works for folders already archived
// to 3-Published just as well as for ones in 1-Pending.
export async function getFolderContents(folderId: string): Promise<PendingFolder | null> {
  const drive = getDriveClient();
  let meta;
  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, modifiedTime, mimeType, trashed',
      supportsAllDrives: true,
    });
    meta = res.data;
  } catch {
    return null;
  }
  if (!meta?.id || !meta.name) return null;
  if (meta.trashed) return null;
  if (meta.mimeType !== FOLDER_MIME) return null;

  const children = await listChildren(meta.id);
  const photosSubfolder = children.find(
    (c) => c.mimeType === FOLDER_MIME && c.name.toLowerCase() === 'photos',
  );

  let photoFiles: DriveFile[] = [];
  if (photosSubfolder) {
    const subChildren = await listChildren(photosSubfolder.id);
    photoFiles = subChildren.filter((c) => c.mimeType.startsWith(IMAGE_MIME_PREFIX));
  }

  const classified = classifyFiles(children);
  classified.photos.push(...photoFiles);
  const { soNumber, customerName } = parseFolderName(meta.name);

  return {
    id: meta.id,
    name: meta.name,
    modifiedTime: meta.modifiedTime ?? undefined,
    soNumber,
    customerName,
    files: classified,
  };
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
    if (!folder.id) continue;
    const contents = await getFolderContents(folder.id);
    if (contents) results.push(contents);
  }

  return results;
}
