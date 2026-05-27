// Run a real Claude generation against the Bishop's Stortford fixture.
// Run: npx tsx --env-file=.env.local scripts/test-draft.mjs

import { listPendingFolders } from '../lib/drive/folders.ts';
import { extractFromPendingFolder } from '../lib/pdf/extract.ts';
import { draftCaseStudy } from '../lib/ai/draft.ts';

const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;
const folders = await listPendingFolders(rootId);
const folder = folders[0];
console.log('Folder:', folder.name);

const spec = await extractFromPendingFolder(folder);
console.log('Customer:', spec.customerName, '/ board type:', spec.boardType, '/ count:', spec.boardCount);

console.time('draft');
const draft = await draftCaseStudy(spec, { club_types: ['School'], customer_name: spec.customerName });
console.timeEnd('draft');

console.log('\n=== H1 PAGE TITLE ===\n' + draft.h1_page_title);
console.log('\n=== INTRODUCTION ===\n' + draft.h1_introduction_text);
console.log('\n=== DESIGN HIGHLIGHTS TITLE ===\n' + draft.h2_design_highlights_title);
console.log('\n=== DESIGN HIGHLIGHTS ===\n' + draft.h2_design_highlights_text);
console.log('\n=== SUMMARY TITLE ===\n' + draft.h2_summary_title);
console.log('\n=== SUMMARY ===\n' + draft.h2_summary_text);
console.log('\n=== CTA ===\n' + draft.cta_text);
console.log('\n=== META TITLE ===\n' + draft.page_meta_title + ` (${draft.page_meta_title.length} chars)`);
console.log('\n=== META DESC ===\n' + draft.page_meta_description + ` (${draft.page_meta_description.length} chars)`);
console.log('\n=== SCHEMA TITLE ===\n' + draft.schema_title);
console.log('\n=== SCHEMA DESC ===\n' + draft.schema_desc);
