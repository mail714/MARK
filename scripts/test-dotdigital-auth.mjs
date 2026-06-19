// Verify the dotdigital credentials by pulling account info and listing the
// address books. Run with:
//   npx tsx --env-file=.env.local scripts/test-dotdigital-auth.mjs

import { dotdigital } from '../lib/dotdigital/client.ts';

console.log('GET /v2/account-info');
const account = await dotdigital.get('/v2/account-info');
console.log(JSON.stringify(account, null, 2));

console.log('\nGET /v2/address-books');
const books = await dotdigital.get('/v2/address-books?select=200');
console.log(`Found ${books.length} address book(s):`);
for (const b of books) {
  console.log(`  - ${b.name} (id=${b.id}, contacts=${b.contacts}, visibility=${b.visibility})`);
}
