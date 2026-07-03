import { createAdminClient } from '@/lib/supabase/admin';

// Recomputes a search's cached counters (FOUND / WITH EMAIL / WITH WEBSITE)
// from the prospects actually linked to it, and persists them back onto the
// chimera_searches row. The counters written during a run only reflect what
// that run scraped — rescans, repairs and dedupe against earlier searches
// all drift them away from reality. This is the single source of truth.

export type SearchCounters = {
  found: number;
  withEmail: number;
  withWebsite: number;
};

export async function recountSearchCounters(
  searchId: string,
): Promise<SearchCounters | null> {
  const supabase = createAdminClient();

  // Page through the link table — a big sweep can exceed PostgREST's
  // default 1000-row response cap.
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('prospect_searches')
      .select('prospect_id')
      .eq('search_id', searchId)
      .range(from, from + 999);
    if (error) return null;
    const rows = (data ?? []) as { prospect_id: string }[];
    ids.push(...rows.map((r) => r.prospect_id));
    if (rows.length < 1000) break;
  }
  // No links (e.g. a run that died before persisting) — keep the cached
  // values rather than zeroing them out.
  if (ids.length === 0) return null;

  // Count in chunks so the .in() filter stays within URL-length limits.
  let withEmail = 0;
  let withWebsite = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [emailRes, websiteRes] = await Promise.all([
      supabase
        .from('prospects')
        .select('id', { count: 'exact', head: true })
        .in('id', chunk)
        .not('emails', 'eq', '{}'),
      supabase
        .from('prospects')
        .select('id', { count: 'exact', head: true })
        .in('id', chunk)
        .not('website', 'is', null),
    ]);
    withEmail += emailRes.count ?? 0;
    withWebsite += websiteRes.count ?? 0;
  }

  const counters: SearchCounters = { found: ids.length, withEmail, withWebsite };
  await supabase
    .from('chimera_searches')
    .update({
      prospects_found: counters.found,
      prospects_with_email: counters.withEmail,
      prospects_with_website: counters.withWebsite,
    })
    .eq('id', searchId);
  return counters;
}
