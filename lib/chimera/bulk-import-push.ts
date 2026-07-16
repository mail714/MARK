import { createAdminClient } from '@/lib/supabase/admin';
import { createBulkJob, updateBulkJob, type BulkJob } from './bulk-jobs';
import { ensureAssignmentsForPush } from './prospects';
import { rankPushableEmails } from './email-priority';
import { listWithEmailProspectIds, listAlreadyPushed } from './push-search';
import { runImportBatch, type ImportContactRow } from '@/lib/dotdigital/import';
import type { EmailStatus } from '@/lib/zerobounce/client';

// Search-wide push via dotdigital's BULK IMPORT — one CSV upload per few
// thousand contacts instead of one API call each. This is the path for
// large lists (imported church registers, whole estate sweeps): it doesn't
// trip the per-contact rate limit, and dotdigital de-dupes and applies its
// suppression list server-side.

const BATCH_SIZE = 4000; // contacts per import file

export async function startBulkImportPush(args: {
  searchId: string;
  brandId: string;
  addressBookId: number;
  sector?: string | null;
  maxEmailsPerProspect?: number;
}): Promise<{ jobId: string; toImport: number; alreadyPushed: number }> {
  const supabase = createAdminClient();

  const withEmail = await listWithEmailProspectIds(supabase, args.searchId);
  const alreadyPushed = await listAlreadyPushed(
    supabase,
    withEmail,
    args.brandId,
    args.addressBookId,
  );
  const toImport = withEmail.filter((id) => !alreadyPushed.has(id));

  const jobId = await createBulkJob({
    kind: 'bulk-import-dotdigital',
    total: toImport.length,
    metadata: {
      search_id: args.searchId,
      address_book_id: args.addressBookId,
      already_pushed: alreadyPushed.size,
      max_emails_per_prospect: args.maxEmailsPerProspect ?? 1,
    },
  });
  setImmediate(() => {
    runBulkImportPush(jobId, toImport, args).catch((err) => {
      console.error('bulk-import-dotdigital job failed', jobId, err);
    });
  });
  return { jobId, toImport: toImport.length, alreadyPushed: alreadyPushed.size };
}

type Row = {
  id: string;
  business_name: string;
  emails: string[];
  phone: string | null;
  website: string | null;
  email_statuses: Record<string, EmailStatus> | null;
  address: string | null;
  google_address: string | null;
};

async function runBulkImportPush(
  jobId: string,
  prospectIds: string[],
  args: {
    brandId: string;
    addressBookId: number;
    sector?: string | null;
    maxEmailsPerProspect?: number;
  },
): Promise<void> {
  const supabase = createAdminClient();
  const limit = Math.max(1, args.maxEmailsPerProspect ?? 1);
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: BulkJob['errors'] = [];

  try {
    const skippedByOperator = await ensureAssignmentsForPush(prospectIds, {
      brand_id: args.brandId,
      sector: args.sector ?? null,
    });
    const targets = prospectIds.filter((id) => !skippedByOperator.has(id));

    // Build the contact rows, carrying each row's prospect id so we can mark
    // exactly the imported prospects as 'pushed' afterwards.
    const items: Array<{ row: ImportContactRow; prospectId: string }> = [];
    const seenEmails = new Set<string>();
    for (let i = 0; i < targets.length; i += 200) {
      const chunk = targets.slice(i, i + 200);
      const { data } = await supabase
        .from('prospects')
        .select('id, business_name, emails, phone, website, email_statuses, address, google_address')
        .in('id', chunk);
      for (const p of (data ?? []) as Row[]) {
        const chosen = rankPushableEmails(
          p.emails,
          p.email_statuses,
          `${p.address ?? ''} ${p.google_address ?? ''}`,
        ).slice(0, limit);
        for (const email of chosen) {
          const key = email.trim().toLowerCase();
          if (seenEmails.has(key)) continue; // dotdigital would merge anyway
          seenEmails.add(key);
          items.push({
            row: {
              email,
              firstName: p.business_name,
              telephone: p.phone,
              website: p.website,
            },
            prospectId: p.id,
          });
        }
      }
    }

    if (items.length === 0) {
      await updateBulkJob(jobId, {
        status: 'completed',
        processed: 0,
        succeeded: 0,
        failed: 0,
        finished_at: new Date().toISOString(),
        last_error: 'No pushable emails to import',
      });
      return;
    }

    await updateBulkJob(jobId, { total: items.length });

    const pushedProspectIds = new Set<string>();
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      try {
        const status = await runImportBatch(
          args.addressBookId,
          batch.map((x) => x.row),
        );
        if (status === 'Finished') {
          succeeded += batch.length;
          for (const x of batch) pushedProspectIds.add(x.prospectId);
        } else {
          failed += batch.length;
          if (errors.length < 20) {
            errors.push({ id: `batch-${i}`, reason: `Import ${status}` });
          }
        }
      } catch (err) {
        failed += batch.length;
        const message = err instanceof Error ? err.message : String(err);
        if (errors.length < 20) errors.push({ id: `batch-${i}`, reason: message });
      }
      processed += batch.length;
      await updateBulkJob(jobId, {
        processed,
        succeeded,
        failed,
        errors,
        last_error: errors[0]?.reason ?? null,
      });
    }

    // Mark the successfully-imported prospects as pushed to this book so
    // re-runs skip them.
    const now = new Date().toISOString();
    const ids = [...pushedProspectIds];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      await supabase
        .from('prospect_brand_assignments')
        .update({
          status: 'pushed',
          pushed_to_dotdigital_book_id: args.addressBookId,
          pushed_at: now,
        })
        .in('prospect_id', chunk)
        .eq('brand_id', args.brandId);
    }

    await updateBulkJob(jobId, {
      status: 'completed',
      processed,
      succeeded,
      failed,
      errors,
      last_error: errors[0]?.reason ?? null,
      finished_at: new Date().toISOString(),
      metadata: {
        contacts_imported: succeeded,
        contacts_failed: failed,
        prospects_pushed: pushedProspectIds.size,
        skipped_by_operator: skippedByOperator.size,
      },
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
