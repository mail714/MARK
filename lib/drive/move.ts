import { getDriveClient } from './client';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

let cachedSegments: { rootId: string; pendingId: string; publishedId: string } | null = null;

async function resolveSegmentIds(rootId: string): Promise<{
  pendingId: string;
  publishedId: string;
}> {
  if (cachedSegments && cachedSegments.rootId === rootId) {
    return { pendingId: cachedSegments.pendingId, publishedId: cachedSegments.publishedId };
  }
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${rootId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const byName = new Map((res.data.files ?? []).map((f) => [f.name ?? '', f.id ?? '']));
  const pendingId = byName.get('1-Pending');
  const publishedId = byName.get('3-Published');
  if (!pendingId) throw new Error("Could not find '1-Pending' folder under the brand root.");
  if (!publishedId) throw new Error("Could not find '3-Published' folder under the brand root.");
  cachedSegments = { rootId, pendingId, publishedId };
  return { pendingId, publishedId };
}

// Move a job folder from 1-Pending to 3-Published. Idempotent — if the folder
// is already under 3-Published this is a no-op. Throws if the folder doesn't
// exist or isn't under either segment.
export async function moveFolderToPublished(folderId: string, brandRootId: string): Promise<{
  moved: boolean;
}> {
  const { pendingId, publishedId } = await resolveSegmentIds(brandRootId);
  const drive = getDriveClient();

  const meta = await drive.files.get({
    fileId: folderId,
    fields: 'id, parents, name',
    supportsAllDrives: true,
  });
  const parents = meta.data.parents ?? [];

  if (parents.includes(publishedId)) {
    return { moved: false };
  }
  // Remove from whichever parent it currently sits under, then add Published.
  const removeParents = parents.includes(pendingId) ? pendingId : parents.join(',');

  await drive.files.update({
    fileId: folderId,
    addParents: publishedId,
    removeParents,
    fields: 'id, parents',
    supportsAllDrives: true,
  });

  return { moved: true };
}
