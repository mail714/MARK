import { createAdminClient } from '@/lib/supabase/admin';
import { createBulkJob, updateBulkJob, type BulkJob } from './bulk-jobs';
import { verifyEmailsBatch, type EmailStatus } from '@/lib/zerobounce/client';

export async function startEmailVerification(prospectIds: string[]): Promise<string> {
  const supabase = createAdminClient();
  // Count the total emails to be verified so the progress bar is meaningful.
  // Chunked so a big select-all list can't overrun the request URL.
  let totalEmails = 0;
  for (let i = 0; i < prospectIds.length; i += 200) {
    const { data } = await supabase
      .from('prospects')
      .select('emails')
      .in('id', prospectIds.slice(i, i + 200));
    for (const r of (data ?? []) as { emails: string[] }[]) {
      totalEmails += r.emails?.length ?? 0;
    }
  }

  const jobId = await createBulkJob({
    kind: 'verify-emails',
    total: totalEmails,
    metadata: { prospect_ids: prospectIds },
  });
  setImmediate(() => {
    runEmailVerification(jobId, prospectIds).catch((err) => {
      console.error('verify-emails job failed', jobId, err);
    });
  });
  return jobId;
}

async function runEmailVerification(jobId: string, prospectIds: string[]): Promise<void> {
  const supabase = createAdminClient();

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let validCount = 0;
  let invalidCount = 0;
  let unknownCount = 0;
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
    type Row = {
      id: string;
      emails: string[];
      email_statuses: Record<string, EmailStatus>;
    };
    // Chunked — a single .in() with a large select-all id list overruns
    // the request URL limit and fails the whole job.
    const rows: Row[] = [];
    for (let i = 0; i < prospectIds.length; i += 200) {
      const { data, error } = await supabase
        .from('prospects')
        .select('id, emails, email_statuses')
        .in('id', prospectIds.slice(i, i + 200));
      if (error) throw new Error(`Failed to load prospects: ${error.message}`);
      rows.push(...((data ?? []) as Row[]));
    }

    // De-duplicate emails across prospects so we only spend one credit per
    // unique email even when several schools share an info@trust.org.uk.
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const p of rows) {
      for (const e of p.emails ?? []) {
        const lower = e.trim().toLowerCase();
        if (!lower || seen.has(lower)) continue;
        // Skip emails we've already verified — re-running shouldn't burn
        // fresh credits on the same addresses.
        if (p.email_statuses && p.email_statuses[lower]) continue;
        seen.add(lower);
        unique.push(lower);
      }
    }

    // The job was created with a rough total (every email on every
    // prospect); now we know the real workload — unique, not-yet-verified
    // emails — correct it so the progress bar can actually reach 100%.
    await updateBulkJob(jobId, { total: unique.length });

    // Hit ZeroBounce in batches of 100.
    const allStatuses = new Map<string, EmailStatus>();
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      try {
        const result = await verifyEmailsBatch(chunk);
        result.statuses.forEach((v, k) => allStatuses.set(k, v));
        // Partial failures (rate limit, credits, transient 5xx) must be
        // visible — a completed job with silently-missing verdicts reads
        // as 'those emails were fine'.
        if (result.failedCount > 0) {
          failed += result.failedCount;
          errors.push({
            id: `batch-${i}`,
            reason: `${result.failedCount} emails failed to verify — ${result.firstError?.message ?? 'unknown error'}`,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ id: `batch-${i}`, reason: message });
        failed += chunk.length;
      }
      processed += chunk.length;
      if (Date.now() - lastFlush > 1500) await flush();
    }

    // Roll up: merge new statuses into each prospect's email_statuses,
    // count valid/invalid/unknown for the summary.
    const now = new Date().toISOString();
    for (const p of rows) {
      const next: Record<string, EmailStatus> = { ...(p.email_statuses ?? {}) };
      let touched = false;
      for (const e of p.emails ?? []) {
        const lower = e.trim().toLowerCase();
        if (!lower) continue;
        const fresh = allStatuses.get(lower);
        if (fresh) {
          next[lower] = fresh;
          touched = true;
        }
        const status = next[lower];
        if (status === 'valid' || status === 'catch-all') validCount += 1;
        else if (status === 'unknown') unknownCount += 1;
        else if (status) invalidCount += 1;
      }
      if (touched) {
        const { error: updateErr } = await supabase
          .from('prospects')
          .update({
            email_statuses: next,
            emails_verified_at: now,
          })
          .eq('id', p.id);
        if (updateErr) {
          errors.push({ id: p.id, reason: updateErr.message });
        } else {
          succeeded += 1;
        }
      }
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
    await supabase
      .from('bulk_jobs')
      .update({
        metadata: {
          prospect_ids: prospectIds,
          valid: validCount,
          invalid: invalidCount,
          unknown: unknownCount,
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
