import { createAdminClient } from '@/lib/supabase/admin';
import {
  resolveGiasResponse,
  streamGiasRowsFromResponse,
  streamGiasRowsFromString,
  type GiasRow,
} from './client';

export type SchoolsSyncSummary = {
  syncId: string;
  records: number;
  sourceUrl: string;
};

export type SyncKickoffOptions = {
  csvOverride?: string;
  sourceUrlOverride?: string;
};

// Creates the sync row in 'running' state and returns the ID immediately.
// The actual work runs via setImmediate after the response is sent, so the
// HTTP route can return in <1s and dodge Render's proxy timeout. UI polls
// /status for progress.
export async function startGiasSyncAsync(opts: SyncKickoffOptions = {}): Promise<string> {
  const supabase = createAdminClient();
  const { data: syncRow, error: syncErr } = await supabase
    .from('schools_register_syncs')
    .insert({
      status: 'running',
      source_url: opts.sourceUrlOverride ?? null,
    })
    .select('id')
    .single();
  if (syncErr) throw new Error(`Failed to start sync: ${syncErr.message}`);
  const syncId = syncRow.id as string;

  setImmediate(() => {
    runGiasSyncBody(syncId, opts).catch((err) => {
      console.error('gov.uk schools sync failed', syncId, err);
    });
  });

  return syncId;
}

// Internal: streams rows out of the GIAS source (URL or pasted CSV) and
// upserts them in serial batches. Memory stays bounded — we hold at most
// one BATCH-sized array of rows at a time, so the full 25k-row register
// imports comfortably under Render's 512MB cap.
async function runGiasSyncBody(syncId: string, opts: SyncKickoffOptions): Promise<void> {
  const supabase = createAdminClient();
  const BATCH = 500;

  try {
    let sourceUrl = 'manual-upload';
    let rows: AsyncIterable<GiasRow> | Iterable<GiasRow>;
    if (opts.csvOverride) {
      rows = streamGiasRowsFromString(opts.csvOverride);
    } else {
      const { response, sourceUrl: url } = await resolveGiasResponse({
        sourceUrlOverride: opts.sourceUrlOverride,
      });
      sourceUrl = url;
      rows = streamGiasRowsFromResponse(response);
      // Record the URL we actually fetched so the UI can show it.
      await supabase
        .from('schools_register_syncs')
        .update({ source_url: sourceUrl })
        .eq('id', syncId);
    }

    const now = new Date().toISOString();
    let batch: GiasRow[] = [];
    let total = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      const chunk = batch.map((r) => ({ ...r, last_synced_at: now }));
      const { error } = await supabase
        .from('schools_register')
        .upsert(chunk as unknown as Record<string, unknown>[], { onConflict: 'urn' });
      if (error) throw new Error(`Upsert batch failed: ${error.message}`);
      total += batch.length;
      batch = []; // Drop the reference so V8 can reclaim the row objects.
      // Surface progress so the UI poller has live numbers.
      await supabase
        .from('schools_register_syncs')
        .update({ records_imported: total })
        .eq('id', syncId);
    };

    for await (const row of rows) {
      batch.push(row);
      if (batch.length >= BATCH) {
        await flush();
      }
    }
    await flush();

    if (total === 0) {
      throw new Error('No rows parsed from CSV — wrong format?');
    }

    await supabase
      .from('schools_register_syncs')
      .update({
        status: 'completed',
        records_imported: total,
        source_url: sourceUrl,
        finished_at: new Date().toISOString(),
      })
      .eq('id', syncId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('schools_register_syncs')
      .update({
        status: 'failed',
        last_error: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', syncId);
  }
}

export type SchoolsSyncStatus = {
  totalSchools: number;
  openSchools: number;
  lastSyncAt: string | null;
  lastSyncStatus: 'running' | 'completed' | 'failed' | null;
  lastError: string | null;
  lastSourceUrl: string | null;
  recordsImported: number;
};

export async function getSchoolsSyncStatus(): Promise<SchoolsSyncStatus> {
  const supabase = createAdminClient();

  // Recover from zombie syncs: if the most-recent row is still 'running' but
  // started more than 5 minutes ago, the worker almost certainly died (e.g.
  // a previous OOM or Render's proxy timing out the route). Mark it failed
  // so the UI stops polling.
  const ZOMBIE_THRESHOLD_MS = 5 * 60 * 1000;
  const { data: latest } = await supabase
    .from('schools_register_syncs')
    .select('id, status, started_at')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && latest.status === 'running') {
    const startedMs = new Date(latest.started_at as string).getTime();
    if (Date.now() - startedMs > ZOMBIE_THRESHOLD_MS) {
      await supabase
        .from('schools_register_syncs')
        .update({
          status: 'failed',
          last_error:
            'Worker died before completing (likely an OOM or request timeout). Try re-syncing.',
          finished_at: new Date().toISOString(),
        })
        .eq('id', latest.id as string);
    }
  }

  const [{ count: totalSchools }, { count: openSchools }, lastSync] = await Promise.all([
    supabase.from('schools_register').select('urn', { count: 'exact', head: true }),
    supabase
      .from('schools_register')
      .select('urn', { count: 'exact', head: true })
      .eq('status', 'Open'),
    supabase
      .from('schools_register_syncs')
      .select('status, last_error, started_at, finished_at, source_url, records_imported')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const last = (lastSync.data ?? null) as {
    status: 'running' | 'completed' | 'failed';
    last_error: string | null;
    started_at: string;
    finished_at: string | null;
    source_url: string | null;
    records_imported: number | null;
  } | null;
  return {
    totalSchools: totalSchools ?? 0,
    openSchools: openSchools ?? 0,
    lastSyncAt: last?.finished_at ?? last?.started_at ?? null,
    lastSyncStatus: last?.status ?? null,
    lastError: last?.last_error ?? null,
    lastSourceUrl: last?.source_url ?? null,
    recordsImported: last?.records_imported ?? 0,
  };
}

// Search the local register by free-text location (matches town, LA name,
// or postcode prefix). Open schools only. Phase filter is optional —
// 'Primary', 'Secondary', 'All-through', '16 plus', 'Not applicable'.
export async function searchSchools(args: {
  location: string;
  phase?: string | null;
  limit?: number;
}): Promise<GiasRow[]> {
  const supabase = createAdminClient();
  const loc = args.location.trim();
  if (!loc) return [];
  const limit = args.limit ?? 200;
  const safe = loc.replace(/[%_,]/g, (c) => `\\${c}`);

  let query = supabase
    .from('schools_register')
    .select('*')
    .eq('status', 'Open')
    .or(
      `town.ilike.%${safe}%,la_name.ilike.%${safe}%,la_district.ilike.%${safe}%,postcode.ilike.${safe}%`,
    )
    .limit(limit);
  if (args.phase) {
    query = query.eq('phase_of_education', args.phase);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Schools search failed: ${error.message}`);
  return (data ?? []) as GiasRow[];
}
