import { createAdminClient } from '@/lib/supabase/admin';

export type CampaignStatus = 'draft' | 'approved' | 'pushed' | 'failed';
export type CampaignType = 'newsletter' | 'promotional' | 'announcement';

export type EmailCampaign = {
  id: string;
  brand_id: string | null;
  status: CampaignStatus;
  internal_name: string | null;
  sector: string | null;
  campaign_type: CampaignType | null;
  intent: string | null;
  address_book_ids: number[];
  subject: string | null;
  preheader: string | null;
  html_body: string | null;
  dotdigital_campaign_id: number | null;
  pushed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailCampaignListItem = Pick<
  EmailCampaign,
  | 'id'
  | 'internal_name'
  | 'subject'
  | 'brand_id'
  | 'sector'
  | 'campaign_type'
  | 'status'
  | 'address_book_ids'
  | 'updated_at'
  | 'pushed_at'
>;

export async function listCampaigns(): Promise<EmailCampaignListItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('email_campaigns')
    .select(
      'id, internal_name, subject, brand_id, sector, campaign_type, status, address_book_ids, updated_at, pushed_at',
    )
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to load campaigns: ${error.message}`);
  return (data as EmailCampaignListItem[]) ?? [];
}

export async function getCampaign(id: string): Promise<EmailCampaign | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load campaign: ${error.message}`);
  return (data as EmailCampaign | null) ?? null;
}

export async function createCampaign(args: {
  internal_name: string;
  brand_id?: string | null;
}): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('email_campaigns')
    .insert({
      internal_name: args.internal_name.trim() || 'Untitled campaign',
      brand_id: args.brand_id ?? null,
      status: 'draft',
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create campaign: ${error.message}`);
  return data.id as string;
}

const EDITABLE_FIELDS = [
  'internal_name',
  'sector',
  'campaign_type',
  'intent',
  'address_book_ids',
  'subject',
  'preheader',
  'html_body',
  'brand_id',
  'status',
] as const;

export async function updateCampaign(
  id: string,
  fields: Partial<Pick<EmailCampaign, (typeof EDITABLE_FIELDS)[number]>>,
): Promise<void> {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in fields) patch[k] = (fields as Record<string, unknown>)[k];
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from('email_campaigns').update(patch).eq('id', id);
  if (error) throw new Error(`Failed to update campaign: ${error.message}`);
}

export async function deleteCampaign(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('email_campaigns').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete campaign: ${error.message}`);
}
