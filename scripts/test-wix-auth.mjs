// Verify the Wix API key + site id route through our production client.
// Run: npx tsx --env-file=.env.local scripts/test-wix-auth.mjs

import { wix } from '../lib/wix/client.ts';

const r = await wix.post(
  'https://www.wixapis.com/wix-data/v2/items/query',
  {
    dataCollectionId: 'ProductsShowcase',
    query: { paging: { limit: 1 }, fields: ['title_fld'] },
  },
);
console.log('✓ Auth works. Got', r.dataItems?.length ?? 0, 'item(s) from ProductsShowcase.');
console.log('  Sample title:', r.dataItems?.[0]?.data?.title_fld ?? '(none)');
