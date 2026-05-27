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
const { salesOrder, proof, ...top } = spec;
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

console.log('\n=== Proof summary ===');
if (proof) {
  const { rawText: _rawP, boards, ...proofSummary } = proof;
  console.log(JSON.stringify(proofSummary, null, 2));
  console.log(`\n  ${boards.length} board(s) detected:`);
  for (const b of boards.slice(0, 5)) {
    console.log(`  ref ${b.ref}: ${b.name} — ${b.size}, ${b.material}`);
  }
  if (boards.length > 5) console.log(`  ... and ${boards.length - 5} more`);
} else {
  console.log('(no proof PDF)');
}
