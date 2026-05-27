// Pull the two PDFs from the first pending folder and dump their text so we
// can see what the parser is working with.
// Run: node --env-file=.env.local scripts/dump-pdf.mjs

import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';

const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;

const absolute = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath);
const auth = new google.auth.GoogleAuth({
  keyFile: absolute,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

async function findChild(parentId, name, mimeType) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and trashed = false${mimeType ? ` and mimeType = '${mimeType}'` : ''}${name ? ` and name contains '${name}'` : ''}`,
    fields: 'files(id, name, mimeType)',
    pageSize: 50,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files ?? [];
}

const FOLDER = 'application/vnd.google-apps.folder';

const pendingList = await findChild(rootId, '1-Pending', FOLDER);
const pending = pendingList.find((f) => f.name === '1-Pending');
const jobs = await findChild(pending.id, null, FOLDER);
console.log('Jobs in 1-Pending:', jobs.map((j) => j.name));

const job = jobs[0];
console.log('\nProcessing:', job.name);
const files = await findChild(job.id);
console.log('Files:', files.map((f) => `${f.name} [${f.mimeType}]`));

async function downloadAndDump(file) {
  console.log(`\n========== ${file.name} ==========`);
  const res = await drive.files.get(
    { fileId: file.id, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  const buf = new Uint8Array(res.data);
  const pdf = await getDocumentProxy(buf);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  console.log(`Pages: ${totalPages}`);
  console.log('---');
  console.log(text);
  console.log('---');
}

const pdfs = files.filter((f) => f.mimeType === 'application/pdf');
for (const pdf of pdfs) {
  await downloadAndDump(pdf);
}
