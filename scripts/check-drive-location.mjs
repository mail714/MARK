// Diagnose the shared-drive situation for the root folder.
// Run: npx tsx --env-file=.env.local scripts/check-drive-location.mjs

import { getDriveClient } from '../lib/drive/client.ts';

const drive = getDriveClient();
const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;

console.log('Checking root folder:', rootId);

const meta = await drive.files.get({
  fileId: rootId,
  fields: 'id, name, parents, driveId, capabilities, owners, trashed',
  supportsAllDrives: true,
});
console.log('\nRoot folder metadata:');
console.log(JSON.stringify(meta.data, null, 2));

if (meta.data.driveId) {
  console.log(`\n✓ Folder is in shared drive: ${meta.data.driveId}`);
  try {
    const sd = await drive.drives.get({ driveId: meta.data.driveId, fields: 'id, name, capabilities' });
    console.log('Shared drive:', sd.data.name);
    console.log('Capabilities:', JSON.stringify(sd.data.capabilities, null, 2));
  } catch (err) {
    console.error('Could not read shared drive metadata:', err.message);
  }
} else {
  console.log('\n✗ Folder is NOT in a shared drive (no driveId). Still in My Drive.');
}

console.log('\nListing shared drives the service account can see:');
try {
  const drives = await drive.drives.list({ fields: 'drives(id, name, capabilities)', pageSize: 50 });
  for (const d of drives.data.drives ?? []) {
    console.log(`  - ${d.name} (${d.id})`);
  }
  if (!drives.data.drives?.length) {
    console.log('  (none — service account is not a member of any shared drive)');
  }
} catch (err) {
  console.error('Error listing drives:', err.message);
}
