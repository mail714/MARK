import { createAdminClient } from '@/lib/supabase/admin';
import {
  domainOf,
  extractEmailsFromHtml,
  normaliseWebsiteUrl,
  scrapeWebsiteForEmailsAndAddress,
} from './website-scrape';
import { huntEmailsViaGoogle } from './google-email-hunt';
import { renderPageHeadless } from './headless-fetch';
import { isScrapingBeeConfigured } from '@/lib/scrapingbee/client';
import { createBulkJob, updateBulkJob, type BulkJob } from './bulk-jobs';
import { recountSearchCounters } from './recount';

// Three distinct email-finding jobs sharing one runner, exposed as
// separate buttons so it's always clear what's being paid for:
//   'scrape'    — free: re-visit each prospect's website with plain
//                 fetches (homepage + its own nav's contact page)
//   'deep-scan' — paid ScrapingBee credits: same scrape but via
//                 residential-IP fetches with JS rendering, for hosts
//                 that block us or only render their email client-side
//   'google'    — paid ScrapingBee credits: search Google for
//                 '"Business Name" <postcode> email', for prospects with
//                 no email at all
export type RescanMode = 'scrape' | 'deep-scan' | 'google';

const KIND_BY_MODE = {
  scrape: 'rescan-website',
  'deep-scan': 'deep-scan-website',
  google: 'google-email-hunt',
} as const;

// Starts the job in the background. Creates a bulk_jobs row in 'running'
// state, kicks off the work via setImmediate (so the HTTP route returns
// under a second), and gives the caller a job_id the UI can poll.
export async function startWebsiteRescan(
  prospectIds: string[],
  mode: RescanMode = 'scrape',
): Promise<string> {
  const jobId = await createBulkJob({
    kind: KIND_BY_MODE[mode],
    total: prospectIds.length,
    metadata: { prospect_ids: prospectIds, mode },
  });
  setImmediate(() => {
    runWebsiteRescan(jobId, prospectIds, mode).catch((err) => {
      console.error(`${mode} email job failed`, jobId, err);
    });
  });
  return jobId;
}

async function runWebsiteRescan(
  jobId: string,
  prospectIds: string[],
  mode: RescanMode,
): Promise<void> {
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
    // Each mode auto-filters the selection to the prospects it can help:
    // scraping needs a website; the paid modes only run where they can
    // add value (deep scan: website but no email yet; Google hunt: no
    // email at all) so credits are never spent on businesses that already
    // have an address.
    const all = (prospects ?? []) as Row[];
    const rows =
      mode === 'scrape'
        ? all.filter((p) => !!p.website)
        : mode === 'deep-scan'
          ? all.filter((p) => !!p.website && (p.emails?.length ?? 0) === 0)
          : all.filter((p) => (p.emails?.length ?? 0) === 0);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let emailsAdded = 0;
    let websitesFound = 0;
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

        if ((mode === 'scrape' || mode === 'deep-scan') && p.website) {
          try {
            // Rescan (scrape) = MARK's own fetch, dressed to look like a
            // real browser (full Chrome header set), free. Deep scan
            // additionally routes through ScrapingBee — residential IPs +
            // JavaScript rendering — for sites that block a plain server
            // or only reveal the email after their scripts run.
            const enrichment = await scrapeWebsiteForEmailsAndAddress(p.website, {
              allowScrapingBee: mode === 'deep-scan',
            });
            for (const e of enrichment.emails) {
              if (!before.has(e)) {
                merged.push(e);
                before.add(e);
                added += 1;
              }
            }

            // Rescan's browser step (free): the plain fetch found nothing,
            // so render the page in a real headless Chromium — this runs
            // the site's JavaScript, catching script-injected emails.
            // Self-disables if Chromium can't launch, so it can't break the
            // job. Deep scan skips this (ScrapingBee already renders JS).
            if (mode === 'scrape' && added === 0 && merged.length === 0) {
              const url = normaliseWebsiteUrl(p.website);
              if (url) {
                const rendered = await renderPageHeadless(url);
                if (rendered) {
                  for (const e of extractEmailsFromHtml(rendered)) {
                    if (!before.has(e)) {
                      merged.push(e);
                      before.add(e);
                      added += 1;
                    }
                  }
                }
              }
            }
            // Nothing found — say WHY and point at the right next step,
            // rather than reporting a silent 'success'.
            if (added === 0 && merged.length === 0) {
              if (mode === 'scrape') {
                failure =
                  enrichment.fetchStatus === 'failed'
                    ? 'Website blocked MARK even with browser rendering (likely an IP block) — try Deep scan'
                    : 'No email found on the site (rendered in a browser) — try Deep scan or Google hunt';
              } else {
                failure =
                  enrichment.fetchStatus === 'failed'
                    ? 'Website unreachable even via ScrapingBee — try Google email hunt'
                    : 'No email anywhere on the site — try Google email hunt';
              }
            }
          } catch (err) {
            failure = err instanceof Error ? err.message : String(err);
          }
        }
        if (mode === 'deep-scan' && !isScrapingBeeConfigured() && !failure) {
          failure = 'SCRAPINGBEE_API_KEY is not set — deep scan needs it';
        }

        // Google hunt mode: search Google via ScrapingBee for the email
        // AND, when the prospect has no website, the company's own site.
        // A found site gets saved and immediately scraped (free direct
        // fetches, contact-page following included) for more emails.
        let foundWebsite: string | null = null;
        if (mode === 'google') {
          if (!isScrapingBeeConfigured()) {
            failure = 'SCRAPINGBEE_API_KEY is not set — the Google hunt needs it';
          } else {
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
              if (!p.website && hunt.website) {
                foundWebsite = hunt.website;
                if (merged.length === 0) {
                  try {
                    const enrichment = await scrapeWebsiteForEmailsAndAddress(foundWebsite, {
                      allowScrapingBee: false,
                    });
                    for (const e of enrichment.emails) {
                      if (!before.has(e)) {
                        merged.push(e);
                        before.add(e);
                        added += 1;
                      }
                    }
                  } catch {
                    // The website is still worth saving even if its scrape
                    // fails — the operator can deep-scan it next.
                  }
                }
              }
            } catch (err) {
              failure = err instanceof Error ? err.message : String(err);
            }
          }
        }

        if (added > 0 || foundWebsite) {
          const { error: updateErr } = await supabase
            .from('prospects')
            .update({
              emails: merged,
              ...(foundWebsite
                ? {
                    website: foundWebsite,
                    website_domain: domainOf(foundWebsite),
                    address_note: 'Website found via Google email hunt',
                  }
                : {}),
            })
            .eq('id', p.id);
          if (updateErr) {
            errors.push({ id: p.id, reason: updateErr.message });
            failed += 1;
          } else {
            emailsAdded += added;
            if (foundWebsite) websitesFound += 1;
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
      metadata: { prospect_ids: prospectIds, mode, websites_found: websitesFound },
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
