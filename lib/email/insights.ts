import { createAdminClient } from '@/lib/supabase/admin';
import { deriveRates, type CampaignStats } from './stats';

// What we hand to both the AI drafter and the on-page operator panel. Same
// numbers either way so the operator can see exactly what the model was told.
export type CampaignInsight = {
  campaign_id: string;
  internal_name: string | null;
  subject: string | null;
  sector: string | null;
  date_sent: string | null;
  recipients: number | null;
  open_rate: number | null;
  click_rate: number | null;
  unsubscribe_rate: number | null;
};

export type BrandInsights = {
  brandId: string;
  sector: string | null;        // null = aggregate across sectors
  campaignsCount: number;
  avgOpenRate: number | null;
  avgClickRate: number | null;
  avgUnsubscribeRate: number | null;
  top: CampaignInsight[];        // best open-rate performers, capped
  bottom: CampaignInsight[];     // worst open-rate performers, capped
};

type RawStatsRow = CampaignStats & {
  email_campaigns: {
    id: string;
    internal_name: string | null;
    subject: string | null;
    brand_id: string | null;
    sector: string | null;
  };
};

function toInsight(row: RawStatsRow): CampaignInsight {
  const rates = deriveRates(row);
  return {
    campaign_id: row.campaign_id,
    internal_name: row.email_campaigns.internal_name,
    subject: row.email_campaigns.subject,
    sector: row.email_campaigns.sector,
    date_sent: row.date_sent,
    recipients: row.num_total_recipients ?? row.num_total_sent ?? null,
    open_rate: rates.openRate,
    click_rate: rates.clickRate,
    unsubscribe_rate: rates.unsubscribeRate,
  };
}

function avg(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v !== null);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// Pulls past stats for a brand (optionally filtered to a sector) and digests
// them into a shape both the drafter prompt and the UI insights panel can use.
// Only counts campaigns that have an actual date_sent — pushed-but-unsent
// campaigns aren't signal.
export async function getBrandInsights(
  brandId: string,
  sector: string | null,
): Promise<BrandInsights> {
  const supabase = createAdminClient();

  // Join email_campaign_stats → email_campaigns, scope by brand and optionally
  // sector. PostgREST does this with select('*, email_campaigns!inner(...)').
  let query = supabase
    .from('email_campaign_stats')
    .select(
      '*, email_campaigns!inner(id, internal_name, subject, brand_id, sector)',
    )
    .eq('email_campaigns.brand_id', brandId)
    .not('date_sent', 'is', null);
  if (sector) query = query.eq('email_campaigns.sector', sector);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load insights: ${error.message}`);

  const rows = (data ?? []) as RawStatsRow[];
  const insights = rows.map(toInsight);

  // Sort by open rate descending for the top / bottom split.
  const sorted = [...insights].sort((a, b) => (b.open_rate ?? 0) - (a.open_rate ?? 0));
  const top = sorted.slice(0, 3);
  // bottom = worst 3 performers, only if we have more than 3 campaigns so we
  // don't double-count top + bottom on small samples.
  const bottom = sorted.length > 4 ? sorted.slice(-2).reverse() : [];

  return {
    brandId,
    sector,
    campaignsCount: insights.length,
    avgOpenRate: avg(insights.map((i) => i.open_rate)),
    avgClickRate: avg(insights.map((i) => i.click_rate)),
    avgUnsubscribeRate: avg(insights.map((i) => i.unsubscribe_rate)),
    top,
    bottom,
  };
}

// Renders insights into the chunk of prompt text the drafter sees. Kept as a
// pure function so the same renderer feeds the UI summary too if we want.
export function insightsToPromptBlock(insights: BrandInsights): string {
  if (insights.campaignsCount === 0) {
    return 'No past performance data yet for this brand+sector — write to the brand voice rules and the brief.';
  }
  const lines: string[] = [];
  lines.push(`# Past performance — ${insights.campaignsCount} sent campaign${insights.campaignsCount === 1 ? '' : 's'} for this brand${insights.sector ? ` and sector "${insights.sector}"` : ''}`);
  lines.push(`Avg open rate (over delivered): ${fmtPct(insights.avgOpenRate)}`);
  lines.push(`Avg click rate (over delivered): ${fmtPct(insights.avgClickRate)}`);
  lines.push(`Avg unsubscribe rate: ${fmtPct(insights.avgUnsubscribeRate)}`);
  lines.push('');
  if (insights.top.length > 0) {
    lines.push('Top-performing recent campaigns (open rate descending):');
    for (const c of insights.top) {
      lines.push(`- "${c.subject ?? c.internal_name ?? '(untitled)'}" — open ${fmtPct(c.open_rate)}, click ${fmtPct(c.click_rate)}, ${c.recipients ?? '?'} recipients`);
    }
  }
  if (insights.bottom.length > 0) {
    lines.push('');
    lines.push('Underperforming campaigns:');
    for (const c of insights.bottom) {
      lines.push(`- "${c.subject ?? c.internal_name ?? '(untitled)'}" — open ${fmtPct(c.open_rate)}, click ${fmtPct(c.click_rate)}, ${c.recipients ?? '?'} recipients`);
    }
  }
  lines.push('');
  lines.push('Extract the pattern from what worked. Avoid the patterns from what didn\'t. Do NOT copy subject lines literally.');
  return lines.join('\n');
}

function fmtPct(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}
