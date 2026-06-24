import { createAdminClient } from '@/lib/supabase/admin';

export type BulkJobKind =
  | 'rescan-website'
  | 'apollo-enrich'
  | 'push-to-dotdigital'
  | 'repair-websites';
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
      | 'processed'
      | 'succeeded'
      | 'failed'
      | 'emails_added'
      | 'contacts_added'
      | 'last_error'
      | 'errors'
      | 'finished_at'
    >
  >,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('bulk_jobs').update(patch).eq('id', id);
  if (error) throw new Error(`Failed to update bulk job: ${error.message}`);
}

// Idempotent recovery: if the most-recent job of a kind is stuck in
// 'running' for too long (worker died), flip it to failed. Polled by the
// UI on first load so the page doesn't show a phantom in-progress state
// indefinitely.
export async function reapZombieJobs(thresholdMs = 5 * 60 * 1000): Promise<void> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - thresholdMs).toISOString();
  await supabase
    .from('bulk_jobs')
    .update({
      status: 'failed',
      last_error: 'Worker died before completing (likely a timeout or OOM).',
      finished_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('started_at', cutoff);
}
