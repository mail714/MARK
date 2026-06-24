import { createAdminClient } from '@/lib/supabase/admin';
import { scrapeWebsiteForEmailsAndAddress } from './website-scrape';

export type RescanResult = {
  prospectsTried: number;
  prospectsUpdated: number;
  emailsAdded: number;
  postcodesConfirmed: number;
  errors: Array<{ prospectId: string; reason: string }>;
};

// Re-runs the website scrape (emails + address cross-check) on every
// supplied prospect that has a website. Adds any newly-found emails to the
// existing emails array, deduped. Used by the 'Rescan websites' bulk
// action — handy after improving the scraper, or just to refresh data on
// a stale search.
//
// Concurrency capped at 4 — enough to feel responsive without hammering
// any one school's web server.
export async function rescanWebsitesForProspects(args: {
  prospectIds: string[];
}): Promise<RescanResult> {
  const supabase = createAdminClient();
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, business_name, website, emails, postcode')
    .in('id', args.prospectIds);
  if (error) throw new Error(`Failed to load prospects: ${error.message}`);

  type Row = {
    id: string;
    business_name: string;
    website: string | null;
    emails: string[];
    postcode: string | null;
  };

  const rows = ((prospects ?? []) as Row[]).filter((p) => !!p.website);

  const result: RescanResult = {
    prospectsTried: 0,
    prospectsUpdated: 0,
    emailsAdded: 0,
    postcodesConfirmed: 0,
    errors: [],
  };

  const CONCURRENCY = 4;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= rows.length) return;
      const p = rows[idx];
      if (!p.website) continue;
      result.prospectsTried += 1;
      try {
        const enrichment = await scrapeWebsiteForEmailsAndAddress(p.website);
        const before = new Set(p.emails.map((e) => e.toLowerCase()));
        const merged = [...p.emails];
        let added = 0;
        for (const e of enrichment.emails) {
          if (!before.has(e)) {
            merged.push(e);
            before.add(e);
            added += 1;
          }
        }
        let postcodeConfirmed = false;
        const patch: Record<string, unknown> = {};
        if (added > 0) patch.emails = merged;
        if (enrichment.address.postcode && p.postcode === enrichment.address.postcode) {
          postcodeConfirmed = true;
        }
        if (Object.keys(patch).length > 0) {
          const { error: updateErr } = await supabase
            .from('prospects')
            .update(patch)
            .eq('id', p.id);
          if (updateErr) {
            result.errors.push({ prospectId: p.id, reason: updateErr.message });
            continue;
          }
          result.prospectsUpdated += 1;
        }
        result.emailsAdded += added;
        if (postcodeConfirmed) result.postcodesConfirmed += 1;
      } catch (err) {
        result.errors.push({
          prospectId: p.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
  await Promise.all(workers);

  return result;
}
