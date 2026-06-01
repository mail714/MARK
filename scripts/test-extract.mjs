// Run the PDF extractor against the first folder in 1-Pending.
// Run: npx tsx scripts/test-extract.mjs
// (needs --env-file=.env.local — use the npm script: npm run test:extract)

import { listPendingFolders } from '../lib/drive/folders.ts';
import { extractFromPendingFolder } from '../lib/pdf/extract.ts';

const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;
if (!rootId) {
  console.error('HONOURS_BOARDS_DRIVE_ROOT_ID not set');
  process.exit(1);
}

const folders = await listPendingFolders(rootId);
if (folders.length === 0) {
  console.error('No folders in 1-Pending');
  process.exit(1);
}

const folder = folders[0];
console.log(`Folder: ${folder.name}`);
console.log(`  salesOrder: ${folder.files.salesOrder?.name ?? '—'}`);
console.log(`  proof:      ${folder.files.proof?.name ?? '—'}`);
console.log(`  photos:     ${folder.files.photos.length}\n`);

const spec = await extractFromPendingFolder(folder);

// Drop raw text for readability
const { salesOrder, ...top } = spec;
console.log('=== Extracted spec ===');
console.log(JSON.stringify(top, null, 2));

console.log('\n=== Sales order summary ===');
if (salesOrder) {
  const { rawText: _rawSo, items, ...soSummary } = salesOrder;
  console.log(JSON.stringify(soSummary, null, 2));
  console.log(`\n  ${items.length} item line(s):`);
  for (const item of items) {
    console.log(
      `  #${item.index} ${item.name} — qty ${item.qty}, ${item.width ?? '?'} x ${item.height ?? '?'}, fixings ${item.fixingsQty ?? '?'}, ${item.total ?? ''}`,
    );
  }
} else {
  console.log('(no sales order PDF)');
}
