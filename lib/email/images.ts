import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandBySlug } from '@/lib/brands';
import { listAllCaseStudyImages, listAllSignetSignsImages } from '@/lib/wix/images';

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
  search?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<{ items: EmailImage[]; total: number; page: number; pageSize: number }> {
  const supabase = createAdminClient();
  const pageSize = filter?.pageSize ?? 36;
  const page = Math.max(1, filter?.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from('email_images')
    .select('*', { count: 'exact' })
    .order('sector', { ascending: true, nullsFirst: false })
    .order('customer_name', { ascending: true });
  if (filter?.brandId) q = q.eq('brand_id', filter.brandId);
  if (filter?.sector) q = q.eq('sector', filter.sector);
  if (filter?.search) {
    const safe = filter.search.replace(/[%_,]/g, (c) => `\\${c}`);
    q = q.or(
      `alt_text.ilike.%${safe}%,description.ilike.%${safe}%,customer_name.ilike.%${safe}%`,
    );
  }
  q = q.range(from, to);

  const { data, count, error } = await q;
  if (error) throw new Error(`Failed to load email images: ${error.message}`);
  return {
    items: (data as EmailImage[]) ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };
}

// Distinct sectors across the email_images table, for the filter dropdowns.
export async function listAllImageSectors(filter?: { brandId?: string | null }): Promise<string[]> {
  const supabase = createAdminClient();
  let q = supabase.from('email_images').select('sector');
  if (filter?.brandId) q = q.eq('brand_id', filter.brandId);
  const { data, error } = await q;
  if (error) return [];
  const set = new Set<string>();
  for (const r of (data as { sector: string | null }[] | null) ?? []) {
    if (r.sector) set.add(r.sector);
  }
  return Array.from(set).sort();
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

// Pull every Products item image from the New Signet Site Wix collection and
// upsert into email_images. Sector is mapped from producttypetag (e.g. 'shop
// signs'). int_or_ext info is appended to the description so the operator can
// see at a glance whether it's internal / external in the picker.
export async function syncSignetSignsProductImages(): Promise<{
  fetched: number;
  inserted: number;
  updated: number;
}> {
  const live = await listAllSignetSignsImages();
  const supabase = createAdminClient();
  const brand = await getBrandBySlug('signet-signs');

  // Signet uses a different source label so it can't collide with Honours
  // Boards rows on the unique (source, source_id, source_role) key.
  const { data: existing } = await supabase
    .from('email_images')
    .select('source_id')
    .eq('source', 'wix-media')
    .eq('brand_id', brand.id);
  const existingKey = new Set(
    (existing as { source_id: string }[] | null ?? []).map((r) => r.source_id),
  );

  const rows = live.map((i) => ({
    source: 'wix-media' as const,
    source_id: i.itemId,
    source_role: null,
    brand_id: brand.id,
    sector: i.productType,
    customer_name: i.productName,
    url: i.url,
    alt_text: i.altText,
    description: [i.altText, i.intOrExt ? `(${i.intOrExt})` : null].filter(Boolean).join(' ') || null,
    width: i.width,
    height: i.height,
    last_synced_at: new Date().toISOString(),
  }));

  if (rows.length) {
    const { error } = await supabase
      .from('email_images')
      .upsert(rows, { onConflict: 'source,source_id,source_role' });
    if (error) throw new Error(`Failed to upsert Signet Signs images: ${error.message}`);
  }

  let inserted = 0;
  let updated = 0;
  for (const i of live) {
    if (existingKey.has(i.itemId)) updated++;
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
