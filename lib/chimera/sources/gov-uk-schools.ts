import { searchSchools } from '@/lib/gov-uk-schools/sync';
import { getSearch, updateSearch } from '../searches';
import { upsertProspect, loadSuppressionIndex, isSuppressed } from '../prospects';
import { domainOf, scrapeWebsiteForEmailsAndAddress } from '../website-scrape';
import type { GiasRow } from '@/lib/gov-uk-schools/client';

const WORKER_CONCURRENCY = 6;

function schoolAddress(s: GiasRow): string {
  return [s.street, s.locality, s.town, s.county, s.postcode]
    .filter(Boolean)
    .join(', ');
}

function schoolTypes(s: GiasRow): string[] {
  return [s.type_of_establishment, s.phase_of_education, s.gender, s.religious_character].filter(
    (x): x is string => !!x,
  );
}

// Runs a schools search end-to-end. Queries the local GIAS register by
// location, optionally scrapes each school's website for email addresses,
// then upserts each as a prospect with source='gov-uk-schools'.
export async function runGovUkSchoolsSearch(searchId: string): Promise<void> {
  const search = await getSearch(searchId);
  if (!search) throw new Error(`Search ${searchId} not found`);
  if (!search.location) throw new Error('Search has no location');

  await updateSearch(searchId, {
    status: 'running',
    started_at: new Date().toISOString(),
    last_error: null,
  });

  try {
    const schools = await searchSchools({
      location: search.location,
      phase: search.category,
      limit: search.max_results ?? 500,
    });

    await updateSearch(searchId, {
      grid_cells_total: schools.length,
      prospects_found: schools.length,
    });

    const suppressions = await loadSuppressionIndex();
    let withEmail = 0;
    let withWebsite = 0;
    let chainsSkipped = 0;
    let processed = 0;

    await runWithConcurrency(schools, WORKER_CONCURRENCY, async (s) => {
      const website = s.website ?? null;
      let emails: string[] = [];
      let addressNote: string | null = null;
      const address = schoolAddress(s);
      const postcode = s.postcode ?? null;

      if (website) {
        try {
          const enriched = await scrapeWebsiteForEmailsAndAddress(website);
          emails = enriched.emails;
          if (enriched.address.postcode && enriched.address.postcode !== postcode) {
            addressNote = `Website lists ${enriched.address.postcode} (GIAS: ${postcode ?? 'none'})`;
          }
        } catch {
          addressNote = 'Website scrape failed';
        }
      }

      const domain = domainOf(website);
      if (isSuppressed({ emails, domain, name: s.establishment_name }, suppressions)) {
        chainsSkipped += 1;
        processed += 1;
        return;
      }

      const headName = [s.head_title, s.head_first_name, s.head_last_name].filter(Boolean).join(' ');
      const notes = [
        s.head_job_title || headName ? `${s.head_job_title ?? 'Head'}: ${headName || '—'}` : null,
        s.number_of_pupils ? `${s.number_of_pupils} pupils` : null,
        s.la_name ? `LA: ${s.la_name}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      await upsertProspect({
        source: 'gov-uk-schools',
        source_id: s.urn,
        business_name: s.establishment_name,
        address,
        google_address: null,
        address_note: addressNote ?? notes ?? null,
        postcode,
        phone: s.telephone ?? null,
        website,
        website_domain: domain,
        emails,
        rating: null,
        reviews: null,
        types: schoolTypes(s),
        raw: s as unknown as Record<string, unknown>,
        is_chain: false,
        chain_reason: null,
        search_id: searchId,
      });

      if (emails.length > 0) withEmail += 1;
      if (website) withWebsite += 1;
      processed += 1;
      await updateSearch(searchId, {
        prospects_with_email: withEmail,
        prospects_with_website: withWebsite,
        chains_skipped: chainsSkipped,
        grid_cells_processed: processed,
      });
    });

    await updateSearch(searchId, {
      status: 'completed',
      finished_at: new Date().toISOString(),
      prospects_found: schools.length - chainsSkipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSearch(searchId, {
      status: 'failed',
      finished_at: new Date().toISOString(),
      last_error: message,
    });
    throw err;
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        await task(items[idx]);
      } catch (err) {
        console.warn('schools worker error:', err instanceof Error ? err.message : err);
      }
    }
  });
  await Promise.all(workers);
}
