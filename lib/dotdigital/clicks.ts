import { dotdigital } from './client';

// dotdigital paginates click activity at /v2/campaigns/{id}/clicks. We page
// through everything and aggregate in code — clean per-link counts even
// though there's no first-class 'clicks-by-link' summary endpoint.

type ClickEvent = {
  contactId: number;
  ipAddress?: string;
  url: string;
  activityDate?: string;
};

const PAGE_SIZE = 1000;

export type LinkClickAggregate = {
  url: string;
  totalClicks: number;
  uniqueClicks: number;   // unique contacts
};

export async function getCampaignLinkClicks(
  dotdigitalCampaignId: number,
): Promise<LinkClickAggregate[]> {
  // url → { total, contacts }
  const buckets = new Map<string, { total: number; contacts: Set<number> }>();

  let skip = 0;
  for (;;) {
    const path = `/v2/campaigns/${dotdigitalCampaignId}/clicks?select=${PAGE_SIZE}&skip=${skip}`;
    const page = await dotdigital.get<ClickEvent[]>(path);
    if (!Array.isArray(page) || page.length === 0) break;

    for (const ev of page) {
      if (!ev.url) continue;
      const bucket = buckets.get(ev.url) ?? { total: 0, contacts: new Set<number>() };
      bucket.total += 1;
      if (typeof ev.contactId === 'number') bucket.contacts.add(ev.contactId);
      buckets.set(ev.url, bucket);
    }

    if (page.length < PAGE_SIZE) break;
    skip += page.length;
    // Hard safety cap — stops a runaway loop if something pathological is
    // happening. 100k events per campaign is far beyond realistic.
    if (skip > 100_000) break;
  }

  return Array.from(buckets.entries())
    .map(([url, b]) => ({ url, totalClicks: b.total, uniqueClicks: b.contacts.size }))
    .sort((a, b) => b.uniqueClicks - a.uniqueClicks);
}
