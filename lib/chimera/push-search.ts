import { createAdminClient } from '@/lib/supabase/admin';
import { createBulkJob, updateBulkJob, type BulkJob } from './bulk-jobs';
import { pushProspectsToBook } from './dotdigital-push';
import { bulkAssignProspects } from './prospects';

// Search-wide push: every with-email prospect linked to a search goes to
// the dotdigital book, regardless of which 500-row page it sits on. Runs
// as a bulk job because big sweeps (1,500+ prospects) outlast a single
// HTTP request. Prospects already pushed to this exact book for this
// brand are skipped up front so re-running is idempotent.

async function listWithEmailProspectIds(
  supabase: ReturnType<typeof createAdminClient>,
  searchId: string,
): Promise<string[]> {
  const linked: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('prospect_searches')
      .select('prospect_id')
      .eq('search_id', searchId)
      .range(from, from + 999);
    if (error) throw new Error(`Failed to load search prospects: ${error.message}`);
    const rows = (data ?? []) as { prospect_id: string }[];
    linked.push(...rows.map((r) => r.prospect_id));
    if (rows.length < 1000) break;
  }

  const withEmail: string[] = [];
  for (let i = 0; i < linked.length; i += 200) {
    const chunk = linked.slice(i, i + 200);
    const { data, error } = await supabase
      .from('prospects')
      .select('id')
      .in('id', chunk)
      .not('emails', 'eq', '{}');
    if (error) throw new Error(`Failed to filter prospects: ${error.message}`);
    withEmail.push(...((data ?? []) as { id: string }[]).map((r) => r.id));
  }
  return withEmail;
}

async function listAlreadyPushed(
  supabase: ReturnType<typeof createAdminClient>,
  prospectIds: string[],
  brandId: string,
  addressBookId: number,
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < prospectIds.length; i += 200) {
    const chunk = prospectIds.slice(i, i + 200);
    const { data } = await supabase
      .from('prospect_brand_assignments')
      .select('prospect_id')
      .in('prospect_id', chunk)
      .eq('brand_id', brandId)
      .eq('pushed_to_dotdigital_book_id', addressBookId);
    for (const r of (data ?? []) as { prospect_id: string }[]) out.add(r.prospect_id);
  }
  return out;
}

export async function startSearchPush(args: {
  searchId: string;
  brandId: string;
  addressBookId: number;
  sector?: string | null;
  maxEmailsPerProspect?: number;
}): Promise<{ jobId: string; toPush: number; alreadyPushed: number }> {
  const supabase = createAdminClient();

  const withEmail = await listWithEmailProspectIds(supabase, args.searchId);
  const alreadyPushed = await listAlreadyPushed(
    supabase,
    withEmail,
    args.brandId,
    args.addressBookId,
  );
  const toPush = withEmail.filter((id) => !alreadyPushed.has(id));

  const jobId = await createBulkJob({
    kind: 'push-to-dotdigital',
    total: toPush.length,
    metadata: {
      search_id: args.searchId,
      address_book_id: args.addressBookId,
      already_pushed: alreadyPushed.size,
      max_emails_per_prospect: args.maxEmailsPerProspect ?? 1,
    },
  });
  setImmediate(() => {
    runSearchPush(jobId, toPush, args).catch((err) => {
      console.error('push-to-dotdigital job failed', jobId, err);
    });
  });
  return { jobId, toPush: toPush.length, alreadyPushed: alreadyPushed.size };
}

async function runSearchPush(
  jobId: string,
  prospectIds: string[],
  args: {
    searchId: string;
    brandId: string;
    addressBookId: number;
    sector?: string | null;
    maxEmailsPerProspect?: number;
  },
): Promise<void> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let contactsAdded = 0;
  const errors: BulkJob['errors'] = [];

  try {
    // Make sure every prospect is assigned to the brand so the push can
    // mark it 'pushed' (mirrors the saved-segment sync flow).
    for (let i = 0; i < prospectIds.length; i += 500) {
      await bulkAssignProspects(prospectIds.slice(i, i + 500), {
        brand_id: args.brandId,
        sector: args.sector ?? null,
        status: 'approved',
      });
    }

    // Push in small chunks so progress ticks and one bad batch can't take
    // down the whole run.
    for (let i = 0; i < prospectIds.length; i += 25) {
      const chunk = prospectIds.slice(i, i + 25);
      try {
        const result = await pushProspectsToBook({
          prospectIds: chunk,
          brandId: args.brandId,
          addressBookId: args.addressBookId,
          maxEmailsPerProspect: args.maxEmailsPerProspect,
        });
        succeeded += result.pushed;
        failed += result.failed;
        contactsAdded += result.contactsPushed;
        for (const e of result.errors) {
          if (errors.length < 20) errors.push({ id: e.prospectId, reason: e.reason });
        }
      } catch (err) {
        failed += chunk.length;
        const message = err instanceof Error ? err.message : String(err);
        if (errors.length < 20) errors.push({ id: `chunk-${i}`, reason: message });
      }
      processed += chunk.length;
      await updateBulkJob(jobId, {
        processed,
        succeeded,
        failed,
        contacts_added: contactsAdded,
        errors,
        last_error: errors[0]?.reason ?? null,
      });
    }

    await updateBulkJob(jobId, {
      status: 'completed',
      processed,
      succeeded,
      failed,
      contacts_added: contactsAdded,
      errors,
      last_error: errors[0]?.reason ?? null,
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
