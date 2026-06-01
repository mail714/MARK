// Inspect where each job folder currently lives.
// Run: npx tsx --env-file=.env.local scripts/where-are-folders.mjs

import { getDriveClient } from '../lib/drive/client.ts';

const drive = getDriveClient();
const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;

const segs = await drive.files.list({
  q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  fields: 'files(id, name)',
  supportsAllDrives: true,
});

for (const s of segs.data.files ?? []) {
  const children = await drive.files.list({
    q: `'${s.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
  });
  console.log(`${s.name}:`);
  for (const f of children.data.files ?? []) console.log(`  - ${f.name} (${f.id})`);
}
