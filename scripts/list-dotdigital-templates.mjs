// List dotdigital templates so we can see what designs are already there.
// Run: npx tsx --env-file=.env.local scripts/list-dotdigital-templates.mjs

import { dotdigital } from '../lib/dotdigital/client.ts';

const list = await dotdigital.get('/v2/templates?select=200');
console.log('Total templates:', Array.isArray(list) ? list.length : 'not an array');
if (Array.isArray(list)) {
  for (const t of list.slice(0, 50)) {
    console.log(`  ${t.id} — ${t.name} (${t.subject ?? 'no subject'})`);
  }
  if (list.length > 50) console.log(`  ... and ${list.length - 50} more`);
}
