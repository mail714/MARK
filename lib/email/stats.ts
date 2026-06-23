import { createAdminClient } from '@/lib/supabase/admin';
import { getCampaignSummary } from '@/lib/dotdigital/stats';
import { getCampaign } from './campaigns';

export type CampaignStats = {
  campaign_id: string;
  dotdigital_campaign_id: number;
  date_sent: string | null;
  num_total_sent: number | null;
  num_total_recipients: number | null;
  num_unique_opens: number | null;
  num_total_opens: number | null;
  num_unique_clicks: number | null;
  num_total_clicks: number | null;
  num_hard_bounces: number | null;
  num_soft_bounces: number | null;
  num_unsubscribes: number | null;
  num_spam_complaints: number | null;
  num_forwards: number | null;
  num_replies: number | null;
  last_synced_at: string;
  raw: Record<string, unknown> | null;
};

// Derived rates so the UI doesn't have to do the maths. Returns null when
// the denominator is zero or missing — keeps the % cell honest.
export function deriveRates(s: CampaignStats): {
  openRate: number | null;
  clickRate: number | null;
  clickToOpenRate: number | null;
  bounceRate: number | null;
  unsubscribeRate: number | null;
} {
  const sent = s.num_total_sent ?? 0;
  const opens = s.num_unique_opens ?? 0;
  const clicks = s.num_unique_clicks ?? 0;
  const hardBounces = s.num_hard_bounces ?? 0;
  const softBounces = s.num_soft_bounces ?? 0;
  const unsubs = s.num_unsubscribes ?? 0;
  const delivered = Math.max(0, sent - hardBounces - softBounces);
  return {
    openRate: delivered > 0 ? opens / delivered : null,
    clickRate: delivered > 0 ? clicks / delivered : null,
    clickToOpenRate: opens > 0 ? clicks / opens : null,
    bounceRate: sent > 0 ? (hardBounces + softBounces) / sent : null,
    unsubscribeRate: delivered > 0 ? unsubs / delivered : null,
  };
}

export async function getCampaignStats(campaignId: string): Promise<CampaignStats | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('email_campaign_stats')
    .select('*')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load campaign stats: ${error.message}`);
  return (data as CampaignStats | null) ?? null;
}

export type CampaignWithStats = {
  id: string;
  internal_name: string | null;
  subject: string | null;
  brand_id: string | null;
  sector: string | null;
  status: string;
  pushed_at: string | null;
  dotdigital_campaign_id: number | null;
  stats: CampaignStats | null;
};

// Reporting overview — every pushed campaign + its latest stats row, if any.
// Ordered by send date desc, falling back to pushed_at so unsent (just-pushed)
// campaigns still show at the top.
export async function listCampaignsWithStats(): Promise<CampaignWithStats[]> {
  const supabase = createAdminClient();
  const { data: campaigns, error } = await supabase
    .from('email_campaigns')
    .select(
      'id, internal_name, subject, brand_id, sector, status, pushed_at, dotdigital_campaign_id',
    )
    .not('dotdigital_campaign_id', 'is', null)
    .order('pushed_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(`Failed to load campaigns: ${error.message}`);

  const rows = (campaigns ?? []) as Omit<CampaignWithStats, 'stats'>[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: stats, error: statsErr } = await supabase
    .from('email_campaign_stats')
    .select('*')
    .in('campaign_id', ids);
  if (statsErr) throw new Error(`Failed to load stats: ${statsErr.message}`);
  const byId = new Map((stats as CampaignStats[]).map((s) => [s.campaign_id, s]));

  return rows
    .map((r) => ({ ...r, stats: byId.get(r.id) ?? null }))
    .sort((a, b) => {
      const ad = a.stats?.date_sent ?? a.pushed_at ?? '';
      const bd = b.stats?.date_sent ?? b.pushed_at ?? '';
      return bd.localeCompare(ad);
    });
}

export async function refreshCampaignStats(campaignId: string): Promise<CampaignStats> {
  const cs = await getCampaign(campaignId);
  if (!cs) throw new Error(`Campaign ${campaignId} not found`);
  if (!cs.dotdigital_campaign_id) {
    throw new Error(
      'Campaign has not been pushed to dotdigital yet — no stats to pull.',
    );
  }
  const summary = await getCampaignSummary(cs.dotdigital_campaign_id);

  const supabase = createAdminClient();
  const row = {
    campaign_id: campaignId,
    dotdigital_campaign_id: cs.dotdigital_campaign_id,
    date_sent: summary.dateSent ?? null,
    num_total_sent: summary.numTotalSent ?? null,
    num_total_recipients: summary.numTotalRecipients ?? null,
    num_unique_opens: summary.numUniqueOpens ?? null,
    num_total_opens: summary.numTotalOpens ?? null,
    num_unique_clicks: summary.numUniqueClicks ?? null,
    num_total_clicks: summary.numTotalClicks ?? null,
    num_hard_bounces: summary.numHardBounces ?? null,
    num_soft_bounces: summary.numSoftBounces ?? null,
    num_unsubscribes: summary.numUnsubscribes ?? null,
    num_spam_complaints: summary.numSpamComplaints ?? null,
    num_forwards: summary.numForwards ?? null,
    num_replies: summary.numReplies ?? null,
    raw: summary as Record<string, unknown>,
    last_synced_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('email_campaign_stats')
    .upsert(row, { onConflict: 'campaign_id' });
  if (error) throw new Error(`Failed to save stats: ${error.message}`);

  return row as CampaignStats;
}
