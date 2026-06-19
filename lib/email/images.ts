import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandBySlug } from '@/lib/brands';
import { listAllCaseStudyImages } from '@/lib/wix/images';

export type EmailImage = {
  id: string;
  source: 'wix-case-study' | 'wix-media' | 'drive' | 'upload';
  source_id: string;
  source_role: string | null;
  brand_id: string | null;
  sector: string | null;
  customer_name: string | null;
  url: string;
  alt_text: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  last_synced_at: string;
};

// Honours Boards club types use a slightly different vocabulary to the sector
// labels we expect operators to type on the email side. Keep this simple — a
// best-effort map so case-study images pick up a sensible sector tag.
function normaliseSector(clubTypes: string[]): string | null {
  if (clubTypes.length === 0) return null;
  // Take the first tag, lowercase, trim plurals where helpful.
  const first = clubTypes[0].trim();
  if (!first) return null;
  return first;
}

export async function listEmailImages(filter?: {
  brandId?: string | null;
  sector?: string | null;
}): Promise<EmailImage[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from('email_images')
    .select('*')
    .order('last_synced_at', { ascending: false });
  if (filter?.brandId) q = q.eq('brand_id', filter.brandId);
  if (filter?.sector) q = q.eq('sector', filter.sector);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load email images: ${error.message}`);
  return (data as EmailImage[]) ?? [];
}

// Pull every case-study image from the Honours Boards Wix collection and upsert
// it into email_images. Idempotent — re-runs only refresh data, no duplicates.
// Returns counts so the operator sees what happened.
export async function syncHonoursBoardsCaseStudyImages(): Promise<{
  fetched: number;
  inserted: number;
  updated: number;
}> {
  const live = await listAllCaseStudyImages();
  const supabase = createAdminClient();

  // Honours Boards is the only brand currently sourcing case-study images.
  const brand = await getBrandBySlug('honours-boards');

  // Figure out which source/source_id/source_role tuples are new vs updated.
  const tuples = live.map((i) => ({ source_id: i.itemId, source_role: i.role }));
  const existing = tuples.length
    ? (
        await supabase
          .from('email_images')
          .select('source_id, source_role')
          .eq('source', 'wix-case-study')
      ).data ?? []
    : [];
  const existingKey = new Set(
    (existing as { source_id: string; source_role: string | null }[]).map(
      (r) => `${r.source_id}::${r.source_role ?? ''}`,
    ),
  );

  const rows = live.map((i) => ({
    source: 'wix-case-study' as const,
    source_id: i.itemId,
    source_role: i.role,
    brand_id: brand.id,
    sector: normaliseSector(i.clubTypes),
    customer_name: i.customerName,
    url: i.url,
    alt_text: i.altText,
    description: i.altText,
    width: i.width,
    height: i.height,
    last_synced_at: new Date().toISOString(),
  }));

  if (rows.length) {
    const { error } = await supabase
      .from('email_images')
      .upsert(rows, { onConflict: 'source,source_id,source_role' });
    if (error) throw new Error(`Failed to upsert email images: ${error.message}`);
  }

  let inserted = 0;
  let updated = 0;
  for (const i of live) {
    if (existingKey.has(`${i.itemId}::${i.role}`)) updated++;
    else inserted++;
  }
  return { fetched: live.length, inserted, updated };
}

export async function pickHeroImage(args: {
  brandId: string | null;
  sector: string | null;
}): Promise<{ url: string; alt: string | null } | null> {
  const supabase = createAdminClient();
  // Prefer sector + brand match, then brand match, then sector match, then any.
  const tries: { brand_id?: string | null; sector?: string | null }[] = [];
  if (args.brandId && args.sector) tries.push({ brand_id: args.brandId, sector: args.sector });
  if (args.brandId) tries.push({ brand_id: args.brandId });
  if (args.sector) tries.push({ sector: args.sector });
  tries.push({});

  for (const t of tries) {
    let q = supabase
      .from('email_images')
      // Prefer main hero shots over detail crops for the email hero.
      .select('url, alt_text, source_role')
      .order('source_role', { ascending: true })
      .limit(1);
    if (t.brand_id !== undefined) q = q.eq('brand_id', t.brand_id);
    if (t.sector !== undefined) q = q.eq('sector', t.sector);
    const { data } = await q;
    const row = (data as { url: string; alt_text: string | null }[] | null)?.[0];
    if (row) return { url: row.url, alt: row.alt_text };
  }
  return null;
}
