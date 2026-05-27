// One-off Drive connectivity check.
// Run: node --env-file=.env.local scripts/check-drive.mjs

import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';

const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;

if (!keyPath || !rootId) {
  console.error('Missing GOOGLE_SERVICE_ACCOUNT_JSON or HONOURS_BOARDS_DRIVE_ROOT_ID');
  process.exit(1);
}

const absolute = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
if (!fs.existsSync(absolute)) {
  console.error('Service account JSON not found at', absolute);
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  keyFile: absolute,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

try {
  const meta = await drive.files.get({
    fileId: rootId,
    fields: 'id, name, mimeType',
    supportsAllDrives: true,
  });
  console.log('✓ Root folder visible:', meta.data.name, `(${meta.data.id})`);

  const children = await drive.files.list({
    q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  console.log('  child folders:', (children.data.files ?? []).map((f) => f.name));

  const pending = (children.data.files ?? []).find((f) => f.name === '1-Pending');
  if (!pending) {
    console.warn('✗ No 1-Pending folder found.');
    process.exit(1);
  }
  const jobs = await drive.files.list({
    q: `'${pending.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name, modifiedTime)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  console.log(`✓ 1-Pending contains ${jobs.data.files?.length ?? 0} folder(s):`);
  for (const j of jobs.data.files ?? []) {
    console.log('   -', j.name);
  }
} catch (err) {
  console.error('✗ Error:', err.message);
  process.exit(1);
}
