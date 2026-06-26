import { createAdminClient } from '@/lib/supabase/admin';
import { promises as dns } from 'node:dns';

// Aggregates dotdigital campaign stats per brand for the reputation
// dashboard. Reads from email_campaign_stats (refreshed by the operator
// via the per-campaign Refresh stats button) and rolls up bounce /
// complaint / unsubscribe rates over the last 90 days. Per industry-
// standard thresholds, sender reputation stays healthy at:
//   bounce       < 2%
//   complaint    < 0.1%
//   unsubscribe  < 0.5%

export type ReputationSummary = {
  brand_id: string;
  brand_slug: string;
  brand_name: string;
  campaigns_90d: number;
  total_sent_90d: number;
  total_delivered_90d: number;
  avg_open_rate: number | null;
  avg_click_rate: number | null;
  bounce_rate: number | null;
  complaint_rate: number | null;
  unsubscribe_rate: number | null;
  worst_campaign: {
    id: string;
    subject: string | null;
    bounce_rate: number;
    sent: number;
  } | null;
};

export async function getReputationSummaries(): Promise<ReputationSummary[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Two clean queries instead of a relational join — robust to PostgREST
  // schema-cache state and easier to debug if anything goes wrong.
  const [{ data: stats, error: statsError }, { data: campaigns, error: campaignsError }, { data: brands }] =
    await Promise.all([
      supabase
        .from('email_campaign_stats')
        .select(
          'campaign_id, date_sent, num_total_sent, num_unique_opens, num_unique_clicks, num_hard_bounces, num_soft_bounces, num_unsubscribes, num_spam_complaints',
        )
        .gte('date_sent', since),
      supabase
        .from('email_campaigns')
        .select('id, brand_id, subject, internal_name'),
      supabase.from('brands').select('id, slug, name').order('name', { ascending: true }),
    ]);
  if (statsError) throw new Error(`Failed to load stats: ${statsError.message}`);
  if (campaignsError) throw new Error(`Failed to load campaigns: ${campaignsError.message}`);

  type StatsRow = {
    campaign_id: string;
    date_sent: string | null;
    num_total_sent: number | null;
    num_unique_opens: number | null;
    num_unique_clicks: number | null;
    num_hard_bounces: number | null;
    num_soft_bounces: number | null;
    num_unsubscribes: number | null;
    num_spam_complaints: number | null;
  };
  type CampaignRow = {
    id: string;
    brand_id: string | null;
    subject: string | null;
    internal_name: string | null;
  };

  const campaignsById = new Map(
    ((campaigns ?? []) as CampaignRow[]).map((c) => [c.id, c]),
  );

  const byBrand = new Map<
    string,
    {
      campaigns: number;
      sent: number;
      delivered: number;
      opens: number;
      clicks: number;
      bounces: number;
      complaints: number;
      unsubscribes: number;
      worst: ReputationSummary['worst_campaign'];
    }
  >();

  for (const s of (stats ?? []) as StatsRow[]) {
    const c = campaignsById.get(s.campaign_id);
    if (!c || !c.brand_id) continue;
    const sent = s.num_total_sent ?? 0;
    const hard = s.num_hard_bounces ?? 0;
    const soft = s.num_soft_bounces ?? 0;
    const delivered = Math.max(0, sent - hard - soft);
    const bucket = byBrand.get(c.brand_id) ?? {
      campaigns: 0,
      sent: 0,
      delivered: 0,
      opens: 0,
      clicks: 0,
      bounces: 0,
      complaints: 0,
      unsubscribes: 0,
      worst: null,
    };
    bucket.campaigns += 1;
    bucket.sent += sent;
    bucket.delivered += delivered;
    bucket.opens += s.num_unique_opens ?? 0;
    bucket.clicks += s.num_unique_clicks ?? 0;
    bucket.bounces += hard + soft;
    bucket.complaints += s.num_spam_complaints ?? 0;
    bucket.unsubscribes += s.num_unsubscribes ?? 0;
    const campaignBounceRate = sent > 0 ? (hard + soft) / sent : 0;
    if (!bucket.worst || campaignBounceRate > bucket.worst.bounce_rate) {
      bucket.worst = {
        id: c.id,
        subject: c.subject ?? c.internal_name,
        bounce_rate: campaignBounceRate,
        sent,
      };
    }
    byBrand.set(c.brand_id, bucket);
  }

  const out: ReputationSummary[] = [];
  for (const b of (brands ?? []) as Array<{ id: string; slug: string; name: string }>) {
    const bucket = byBrand.get(b.id);
    out.push({
      brand_id: b.id,
      brand_slug: b.slug,
      brand_name: b.name,
      campaigns_90d: bucket?.campaigns ?? 0,
      total_sent_90d: bucket?.sent ?? 0,
      total_delivered_90d: bucket?.delivered ?? 0,
      avg_open_rate: bucket && bucket.delivered > 0 ? bucket.opens / bucket.delivered : null,
      avg_click_rate: bucket && bucket.delivered > 0 ? bucket.clicks / bucket.delivered : null,
      bounce_rate: bucket && bucket.sent > 0 ? bucket.bounces / bucket.sent : null,
      complaint_rate:
        bucket && bucket.delivered > 0 ? bucket.complaints / bucket.delivered : null,
      unsubscribe_rate:
        bucket && bucket.delivered > 0 ? bucket.unsubscribes / bucket.delivered : null,
      worst_campaign: bucket?.worst ?? null,
    });
  }
  return out;
}

// Checks a domain against the major Domain Block Lists via DNS. No API key
// needed — DBLs resolve to an A record (typically 127.0.0.x) when listed,
// NXDOMAIN when not. Fast (parallel), tens of milliseconds each.

const DOMAIN_BLOCKLISTS: { name: string; suffix: string }[] = [
  { name: 'Spamhaus DBL', suffix: 'dbl.spamhaus.org' },
  { name: 'SURBL', suffix: 'multi.surbl.org' },
  { name: 'URIBL Black', suffix: 'black.uribl.com' },
  { name: 'Spamhaus ZRD', suffix: 'zrd.spamhaus.org' },
];

export type BlacklistCheck = {
  list: string;
  listed: boolean;
  result: string | null;
  error: string | null;
};

export type DomainHealth = {
  domain: string;
  checks: BlacklistCheck[];
  totalListings: number;
};

async function checkOne(domain: string, list: { name: string; suffix: string }): Promise<BlacklistCheck> {
  const query = `${domain}.${list.suffix}`;
  try {
    const addresses = await dns.resolve4(query);
    const first = addresses[0] ?? null;
    // Real blacklist listings return 127.0.0.2-99 (each value encoding a
    // specific reason). Anything in 127.255.x.x — typically what Spamhaus
    // returns when a query is refused for coming from an open resolver,
    // or rate-limited — means our query couldn't be properly answered,
    // NOT that the domain is listed. Treating those as listings produces
    // false positives across every domain we check.
    if (first && first.startsWith('127.255.')) {
      return {
        list: list.name,
        listed: false,
        result: first,
        error: `lookup blocked by ${list.name} (open-resolver / rate-limit refusal: ${first})`,
      };
    }
    if (first === '127.0.0.255') {
      return {
        list: list.name,
        listed: false,
        result: first,
        error: 'lookup error response (127.0.0.255) — query couldn\'t be checked',
      };
    }
    return {
      list: list.name,
      listed: true,
      result: first,
      error: null,
    };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { list: list.name, listed: false, result: null, error: null };
    }
    return {
      list: list.name,
      listed: false,
      result: null,
      error: code ?? (err instanceof Error ? err.message : String(err)),
    };
  }
}

export async function checkDomainHealth(domain: string): Promise<DomainHealth> {
  const checks = await Promise.all(DOMAIN_BLOCKLISTS.map((l) => checkOne(domain, l)));
  return {
    domain,
    checks,
    totalListings: checks.filter((c) => c.listed).length,
  };
}

// Derives the most likely sending domain for a brand from its website URL.
// e.g. https://www.signetsigns.co.uk → signetsigns.co.uk. Signet sends from
// their primary domain rather than a subdomain; if a brand starts using
// a dedicated sending subdomain (recommended for cold outreach later), we'd
// add a sending_domain column on brands and prefer that here.
export function sendingDomainForBrand(websiteUrl: string | null | undefined): string | null {
  if (!websiteUrl) return null;
  try {
    const u = new URL(websiteUrl);
    return u.host.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}
