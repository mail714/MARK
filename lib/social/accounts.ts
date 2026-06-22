import { createAdminClient } from '@/lib/supabase/admin';
import type { SocialPlatform } from './platforms';

export type BrandSocialAccount = {
  id: string;
  brand_id: string;
  platform: SocialPlatform;
  handle: string | null;
  profile_url: string | null;
  scheduler_account_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listBrandSocialAccounts(): Promise<BrandSocialAccount[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('brand_social_accounts')
    .select('*')
    .order('brand_id', { ascending: true })
    .order('platform', { ascending: true });
  if (error) throw new Error(`Failed to load social accounts: ${error.message}`);
  return (data as BrandSocialAccount[]) ?? [];
}

export async function getBrandSocialAccounts(brandId: string): Promise<BrandSocialAccount[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('brand_social_accounts')
    .select('*')
    .eq('brand_id', brandId)
    .order('platform', { ascending: true });
  if (error) throw new Error(`Failed to load social accounts: ${error.message}`);
  return (data as BrandSocialAccount[]) ?? [];
}

// Upsert by (brand_id, platform). Passing all-null fields effectively clears
// the account but the row stays — keeps the operator's notes intact.
export async function upsertBrandSocialAccount(args: {
  brand_id: string;
  platform: SocialPlatform;
  handle?: string | null;
  profile_url?: string | null;
  scheduler_account_id?: string | null;
  notes?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('brand_social_accounts')
    .upsert(args, { onConflict: 'brand_id,platform' });
  if (error) throw new Error(`Failed to save social account: ${error.message}`);
}

export async function deleteBrandSocialAccount(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('brand_social_accounts').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete social account: ${error.message}`);
}
