// Test the new prompt + Opus 4.7 with a synthetic spec.
// Run: npx tsx --env-file=.env.local scripts/test-draft-mock.mjs

import { draftCaseStudy } from '../lib/ai/draft.ts';

const spec = {
  soNumber: '58060',
  customerName: "The Bishop's Stortford High School",
  customerBrief: 'Acrylic Honours Boards',
  customerAddress: "The Bishop's Stortford High School, Beaumont Avenue, Hertfordshire, Bishop's Stortford, England CM23 4SH",
  contactName: 'Clare Hughes',
  contactEmail: 'clare.hughes@tbshs.org',
  contactPhone: '01279 869502',
  orderDate: 'Fri, 22/11/2024',
  boardType: 'Acrylic',
  boardSize: '740 x 1200mm',
  material: '8mm clear acrylic',
  background: 'Solid black vinyl to the rear',
  graphics: 'Gold Avery 736 vinyl lettering and dividing lines and logo applied to face',
  fixings: '19mm stand-off black fixings',
  style: 'Gable top acrylic honours boards',
  boardCount: 22,
  clubTypes: ['Schools'],
  salesOrder: null,
};

console.time('draft');
const draft = await draftCaseStudy(spec, { club_types: ['Schools'], customer_name: spec.customerName });
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

// Em-dash check
const fullBody = [draft.h1_introduction_text, draft.h2_design_highlights_text, draft.h2_summary_text, draft.cta_text].join('\n');
const emDashCount = (fullBody.match(/—/g) || []).length;
const enDashCount = (fullBody.match(/–/g) || []).length;
console.log(`\nDASH CHECK: em-dashes=${emDashCount}, en-dashes=${enDashCount}`);
