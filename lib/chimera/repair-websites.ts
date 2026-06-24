import { createAdminClient } from '@/lib/supabase/admin';
import { createBulkJob, updateBulkJob, type BulkJob } from './bulk-jobs';
import { findWebsiteForProspect } from './find-website';
import { domainOf, normaliseWebsiteUrl } from './website-scrape';

// Fire-and-forget: creates the bulk_jobs row and kicks off the work via
// setImmediate so the HTTP route returns under a second. UI polls
// /api/chimera/jobs/[id] for live progress.
export async function startWebsiteRepair(prospectIds: string[]): Promise<string> {
  const jobId = await createBulkJob({
    kind: 'repair-websites',
    total: prospectIds.length,
    metadata: { prospect_ids: prospectIds },
  });
  setImmediate(() => {
    runWebsiteRepair(jobId, prospectIds).catch((err) => {
      console.error('repair-websites job failed', jobId, err);
    });
  });
  return jobId;
}

async function runWebsiteRepair(jobId: string, prospectIds: string[]): Promise<void> {
  const supabase = createAdminClient();

  // Counter conventions:
  //   succeeded = HIGH-confidence Google match found AND website applied
  //   failed    = error during lookup (Google API, etc.)
  //   metadata.suggestions = MEDIUM/LOW match with a website but not
  //                          auto-applied (operator should review)
  //   metadata.no_match     = Google returned nothing usable
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let suggestions = 0;
  let noMatch = 0;
  const errors: BulkJob['errors'] = [];
  let lastFlush = Date.now();

  const flush = async () => {
    await updateBulkJob(jobId, {
      processed,
      succeeded,
      failed,
      errors: errors.slice(0, 20),
      last_error: errors[0]?.reason ?? null,
    });
    lastFlush = Date.now();
  };

  try {
    for (const id of prospectIds) {
      processed += 1;
      try {
        const result = await findWebsiteForProspect(id);
        if (!result.ok || !result.candidate) {
          noMatch += 1;
          if (Date.now() - lastFlush > 1500) await flush();
          continue;
        }
        const c = result.candidate;
        if (c.confidence === 'high' && c.website) {
          const normalised = normaliseWebsiteUrl(c.website);
          if (!normalised) {
            errors.push({ id, reason: `Auto-find returned unparseable URL: ${c.website}` });
            failed += 1;
            if (Date.now() - lastFlush > 1500) await flush();
            continue;
          }
          const { error: updateErr } = await supabase
            .from('prospects')
            .update({
              website: normalised,
              website_domain: domainOf(normalised),
            })
            .eq('id', id);
          if (updateErr) {
            errors.push({ id, reason: updateErr.message });
            failed += 1;
          } else {
            succeeded += 1;
          }
        } else {
          // Lower-confidence match — left for operator review via the
          // per-prospect Update Website button.
          suggestions += 1;
        }
      } catch (err) {
        errors.push({
          id,
          reason: err instanceof Error ? err.message : String(err),
        });
        failed += 1;
      }
      if (Date.now() - lastFlush > 1500) await flush();
    }
    await flush();

    await updateBulkJob(jobId, {
      status: 'completed',
      processed,
      succeeded,
      failed,
      errors: errors.slice(0, 20),
      finished_at: new Date().toISOString(),
    });
    // Store the soft counters on metadata so the UI can show them as a
    // hint without polluting the standard bulk-job counter columns.
    await supabase
      .from('bulk_jobs')
      .update({
        metadata: {
          prospect_ids: prospectIds,
          suggestions,
          no_match: noMatch,
        },
      })
      .eq('id', jobId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateBulkJob(jobId, {
      status: 'failed',
      last_error: message,
      finished_at: new Date().toISOString(),
    });
  }
}
