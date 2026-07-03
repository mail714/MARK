import { createAdminClient } from '@/lib/supabase/admin';
import { domainOf, scrapeWebsiteForEmailsAndAddress } from './website-scrape';
import { huntEmailsViaGoogle } from './google-email-hunt';
import { isScrapingBeeConfigured } from '@/lib/scrapingbee/client';
import { createBulkJob, updateBulkJob, type BulkJob } from './bulk-jobs';
import { recountSearchCounters } from './recount';

// Starts a rescan as a background job. Creates a bulk_jobs row in
// 'running' state, kicks off the work via setImmediate (so the HTTP route
// returns under a second), and gives the caller a job_id the UI can poll
// for live progress.
export async function startWebsiteRescan(prospectIds: string[]): Promise<string> {
  const jobId = await createBulkJob({
    kind: 'rescan-website',
    total: prospectIds.length,
    metadata: { prospect_ids: prospectIds },
  });
  setImmediate(() => {
    runWebsiteRescan(jobId, prospectIds).catch((err) => {
      console.error('rescan-website job failed', jobId, err);
    });
  });
  return jobId;
}

async function runWebsiteRescan(jobId: string, prospectIds: string[]): Promise<void> {
  const supabase = createAdminClient();
  try {
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('id, business_name, website, emails, postcode, address')
      .in('id', prospectIds);
    if (error) throw new Error(`Failed to load prospects: ${error.message}`);

    type Row = {
      id: string;
      business_name: string;
      website: string | null;
      emails: string[];
      postcode: string | null;
      address: string | null;
    };
    // No-website prospects are included: the scrape step is skipped for
    // them but the Google email hunt below can still find an address.
    const rows = (prospects ?? []) as Row[];

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let emailsAdded = 0;
    const errors: BulkJob['errors'] = [];
    let lastFlush = Date.now();

    const flush = async () => {
      await updateBulkJob(jobId, {
        processed,
        succeeded,
        failed,
        emails_added: emailsAdded,
        errors: errors.slice(0, 20),
        last_error: errors[0]?.reason ?? null,
      });
      lastFlush = Date.now();
    };

    const CONCURRENCY = 4;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
      for (;;) {
        const idx = cursor++;
        if (idx >= rows.length) return;
        const p = rows[idx];
        const before = new Set(p.emails.map((e) => e.toLowerCase()));
        const merged = [...p.emails];
        let added = 0;
        let failure: string | null = null;

        if (p.website) {
          try {
            const enrichment = await scrapeWebsiteForEmailsAndAddress(p.website);
            for (const e of enrichment.emails) {
              if (!before.has(e)) {
                merged.push(e);
                before.add(e);
                added += 1;
              }
            }
          } catch (err) {
            failure = err instanceof Error ? err.message : String(err);
          }
        }

        // Google fallback — only when the prospect still has no email at
        // all after the scrape (or has no website to scrape). Searches
        // '"Business Name" <postcode> email' via ScrapingBee and extracts
        // from the snippets / top result pages.
        if (merged.length === 0 && isScrapingBeeConfigured()) {
          try {
            const hunt = await huntEmailsViaGoogle({
              businessName: p.business_name,
              locationHint: p.postcode ?? p.address,
              websiteDomain: domainOf(p.website),
            });
            for (const e of hunt.emails) {
              if (!before.has(e)) {
                merged.push(e);
                before.add(e);
                added += 1;
              }
            }
            // The hunt rescued a prospect whose site scrape failed — that
            // shouldn't count as a failure in the summary.
            if (added > 0) failure = null;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (!failure) failure = `Google email hunt: ${message}`;
          }
        }

        if (added > 0) {
          const { error: updateErr } = await supabase
            .from('prospects')
            .update({ emails: merged })
            .eq('id', p.id);
          if (updateErr) {
            errors.push({ id: p.id, reason: updateErr.message });
            failed += 1;
          } else {
            emailsAdded += added;
            succeeded += 1;
          }
        } else if (failure) {
          errors.push({ id: p.id, reason: failure });
          failed += 1;
        } else {
          succeeded += 1;
        }
        processed += 1;

        // Flush progress every couple of seconds so the poller sees live
        // updates without us hammering the DB on every single prospect.
        if (Date.now() - lastFlush > 1500) {
          await flush();
        }
      }
    });
    await Promise.all(workers);
    await flush();

    // Recount the with-email / with-website totals on every chimera_searches
    // row that contains any of the affected prospects, so the search-header
    // tiles ('WITH EMAIL: 58') refresh to reflect the rescan. Without this
    // the tiles keep showing the snapshot from when the original search ran.
    await recountAffectedSearches(supabase, prospectIds);

    await updateBulkJob(jobId, {
      status: 'completed',
      processed,
      succeeded,
      failed,
      emails_added: emailsAdded,
      errors: errors.slice(0, 20),
      finished_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateBulkJob(jobId, {
      status: 'failed',
      last_error: message,
      finished_at: new Date().toISOString(),
    });
  }
}

// Refresh the cached counters on every search that contains any of the
// affected prospects. Called at the end of a rescan so the search-header
// tiles (WITH EMAIL, WITH WEBSITE) match reality instead of showing the
// snapshot from when the original search completed.
async function recountAffectedSearches(
  supabase: ReturnType<typeof createAdminClient>,
  prospectIds: string[],
): Promise<void> {
  if (prospectIds.length === 0) return;
  const { data: links } = await supabase
    .from('prospect_searches')
    .select('search_id')
    .in('prospect_id', prospectIds);
  const searchIds = Array.from(
    new Set(((links ?? []) as { search_id: string }[]).map((l) => l.search_id)),
  );
  for (const searchId of searchIds) {
    await recountSearchCounters(searchId);
  }
}
