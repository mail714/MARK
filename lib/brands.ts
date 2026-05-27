import { createAdminClient } from '@/lib/supabase/admin';
import type { Brand } from '@/lib/types';

let cache: Map<string, Brand> | null = null;

async function loadBrands(): Promise<Map<string, Brand>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('brands')
    .select('id, slug, name, website_url, wix_site_id, drive_root_folder_id');
  if (error) throw new Error(`Failed to load brands: ${error.message}`);
  return new Map((data as Brand[]).map((b) => [b.slug, b]));
}

export async function getBrandBySlug(slug: string): Promise<Brand> {
  if (!cache) cache = await loadBrands();
  const b = cache.get(slug);
  if (!b) throw new Error(`Brand not found: ${slug}`);
  return b;
}
