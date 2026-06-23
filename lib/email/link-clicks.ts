import { createAdminClient } from '@/lib/supabase/admin';
import { getCampaignLinkClicks } from '@/lib/dotdigital/clicks';
import { getCampaign } from './campaigns';

export type CampaignLink = {
  id: string;
  campaign_id: string;
  url: string;
  total_clicks: number;
  unique_clicks: number;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

export async function getCampaignLinks(campaignId: string): Promise<CampaignLink[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('email_campaign_links')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('unique_clicks', { ascending: false });
  if (error) throw new Error(`Failed to load campaign links: ${error.message}`);
  return (data as CampaignLink[]) ?? [];
}

export async function refreshCampaignLinks(campaignId: string): Promise<CampaignLink[]> {
  const c = await getCampaign(campaignId);
  if (!c) throw new Error(`Campaign ${campaignId} not found`);
  if (!c.dotdigital_campaign_id) {
    throw new Error('Campaign has not been pushed to dotdigital yet — no link clicks to pull.');
  }
  const aggregates = await getCampaignLinkClicks(c.dotdigital_campaign_id);

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  if (aggregates.length > 0) {
    const rows = aggregates.map((a) => ({
      campaign_id: campaignId,
      url: a.url,
      total_clicks: a.totalClicks,
      unique_clicks: a.uniqueClicks,
      last_synced_at: now,
    }));
    const { error } = await supabase
      .from('email_campaign_links')
      .upsert(rows, { onConflict: 'campaign_id,url' });
    if (error) throw new Error(`Failed to save link clicks: ${error.message}`);
  }

  // Remove rows for URLs the campaign no longer reports. Keeps the table
  // honest when a campaign's content gets re-pushed with different links.
  const urls = aggregates.map((a) => a.url);
  if (urls.length > 0) {
    await supabase
      .from('email_campaign_links')
      .delete()
      .eq('campaign_id', campaignId)
      .not('url', 'in', `(${urls.map((u) => `"${u.replace(/"/g, '""')}"`).join(',')})`);
  } else {
    await supabase.from('email_campaign_links').delete().eq('campaign_id', campaignId);
  }

  return getCampaignLinks(campaignId);
}
