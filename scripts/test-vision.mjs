// Exercise sharp + Claude vision against real Drive photos.
// Skips Supabase Storage (blocked from this sandbox).
// Run: npx tsx --env-file=.env.local scripts/test-vision.mjs

import { listPendingFolders } from '../lib/drive/folders.ts';
import { downloadDriveFile } from '../lib/drive/download.ts';
import { makeVisionThumb, resizeToHero } from '../lib/images/process.ts';
import { pickHeroAndDetailImages } from '../lib/ai/vision.ts';

const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;
const folders = await listPendingFolders(rootId);
const folder = folders[0];
console.log('Folder:', folder.name);
console.log('Photos found:', folder.files.photos.length);
if (folder.files.photos.length === 0) {
  console.error('No photos to test against.');
  process.exit(1);
}

const candidates = [];
for (const photo of folder.files.photos) {
  console.log(`Downloading ${photo.name}…`);
  const bytes = await downloadDriveFile(photo.id);
  console.log(`  size: ${(bytes.length / 1024).toFixed(0)} KB`);

  console.time(`  resize hero (${photo.name})`);
  const hero = await resizeToHero(Buffer.from(bytes));
  console.timeEnd(`  resize hero (${photo.name})`);
  console.log(`  hero: ${hero.width}x${hero.height}, ${(hero.buffer.length / 1024).toFixed(0)} KB`);

  console.time(`  make thumb (${photo.name})`);
  const thumb = await makeVisionThumb(Buffer.from(bytes));
  console.timeEnd(`  make thumb (${photo.name})`);
  console.log(`  thumb: ${thumb.width}x${thumb.height}, ${(thumb.buffer.length / 1024).toFixed(0)} KB`);

  candidates.push({
    driveFileId: photo.id,
    originalFilename: photo.name,
    thumbBase64: thumb.buffer.toString('base64'),
    thumbContentType: 'image/jpeg',
  });
}

console.log('\nSending', candidates.length, 'thumbs to Claude vision…');
console.time('vision');
const sel = await pickHeroAndDetailImages(candidates, {
  customer_name: "The Bishop's Stortford High School",
  board_type: 'Acrylic',
  club_types: ['School'],
});
console.timeEnd('vision');
console.log('\nSelection:');
console.log('  MAIN  =>', candidates[sel.mainIndex].originalFilename);
console.log('    alt:', sel.mainAltText, `(${sel.mainAltText.length} chars)`);
console.log('  IMAGE2 =>', candidates[sel.image2Index].originalFilename);
console.log('    alt:', sel.image2AltText, `(${sel.image2AltText.length} chars)`);
