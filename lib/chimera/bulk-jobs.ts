import { createAdminClient } from '@/lib/supabase/admin';

export type BulkJobKind =
  | 'rescan-website'
  | 'deep-scan-website'
  | 'google-email-hunt'
  | 'apollo-enrich'
  | 'push-to-dotdigital'
  | 'bulk-import-dotdigital'
  | 'repair-websites'
  | 'verify-emails';
export type BulkJobStatus = 'running' | 'completed' | 'failed';

export type BulkJob = {
  id: string;
  kind: BulkJobKind;
  status: BulkJobStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  emails_added: number;
  contacts_added: number;
  last_error: string | null;
  errors: Array<{ id: string; reason: string }>;
  metadata: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function createBulkJob(args: {
  kind: BulkJobKind;
  total: number;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('bulk_jobs')
    .insert({
      kind: args.kind,
      total: args.total,
      metadata: args.metadata ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create bulk job: ${error.message}`);
  return data.id as string;
}

export async function getBulkJob(id: string): Promise<BulkJob | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('bulk_jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load bulk job: ${error.message}`);
  return (data as BulkJob | null) ?? null;
}

export async function updateBulkJob(
  id: string,
  patch: Partial<
    Pick<
      BulkJob,
      | 'status'
      | 'total'
      | 'processed'
      | 'succeeded'
      | 'failed'
      | 'emails_added'
      | 'contacts_added'
      | 'last_error'
      | 'errors'
      | 'finished_at'
      | 'metadata'
    >
  >,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('bulk_jobs').update(patch).eq('id', id);
  if (error) throw new Error(`Failed to update bulk job: ${error.message}`);
}

// Idempotent recovery: flip genuinely dead jobs to failed. Liveness is
// judged on updated_at, NOT started_at — workers flush progress every
// ~1.5s (and the set_updated_at trigger stamps every write), so a healthy
// job's updated_at is always fresh no matter how long it's been running.
// A big push or rescan legitimately runs for 20+ minutes; only a job
// whose row has gone silent is a zombie.
export async function reapZombieJobs(thresholdMs = 10 * 60 * 1000): Promise<void> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - thresholdMs).toISOString();
  await supabase
    .from('bulk_jobs')
    .update({
      status: 'failed',
      last_error: 'Worker died before completing (likely a server restart mid-job).',
      finished_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('updated_at', cutoff);
}
