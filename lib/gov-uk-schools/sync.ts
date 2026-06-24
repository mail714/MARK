import { createAdminClient } from '@/lib/supabase/admin';
import { fetchGiasCsv, parseGiasCsv, type GiasRow } from './client';

export type SchoolsSyncSummary = {
  syncId: string;
  records: number;
  sourceUrl: string;
};

// Downloads + parses + upserts the whole GIAS register. Upserts in chunks
// of 2000 with 4-way parallelism so a 25k-row register completes in seconds
// rather than minutes. A sync row in schools_register_syncs tracks status
// for the admin UI poller.
export async function runGiasSync(csvOverride?: string): Promise<SchoolsSyncSummary> {
  const supabase = createAdminClient();
  const { data: syncRow, error: syncErr } = await supabase
    .from('schools_register_syncs')
    .insert({ status: 'running' })
    .select('id')
    .single();
  if (syncErr) throw new Error(`Failed to start sync: ${syncErr.message}`);
  const syncId = syncRow.id as string;

  try {
    let csv: string;
    let sourceUrl = 'manual-upload';
    if (csvOverride) {
      csv = csvOverride;
    } else {
      const fetched = await fetchGiasCsv();
      csv = fetched.csv;
      sourceUrl = fetched.sourceUrl;
    }

    const rows = parseGiasCsv(csv);
    if (rows.length === 0) {
      throw new Error('Parsed CSV had zero rows — check the file format');
    }

    const now = new Date().toISOString();
    const CHUNK = 2000;
    const CONCURRENCY = 4;
    const chunks: GiasRow[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      chunks.push(rows.slice(i, i + CHUNK));
    }

    let nextChunk = 0;
    let totalUpserted = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
      for (;;) {
        const idx = nextChunk++;
        if (idx >= chunks.length) return;
        const chunk = chunks[idx].map((r) => ({ ...r, last_synced_at: now }));
        const { error } = await supabase
          .from('schools_register')
          .upsert(chunk as unknown as Record<string, unknown>[], { onConflict: 'urn' });
        if (error) throw new Error(`Upsert chunk ${idx} failed: ${error.message}`);
        totalUpserted += chunk.length;
        // Surface progress on each chunk so the UI poller has something to show.
        await supabase
          .from('schools_register_syncs')
          .update({ records_imported: totalUpserted })
          .eq('id', syncId);
      }
    });
    await Promise.all(workers);

    await supabase
      .from('schools_register_syncs')
      .update({
        status: 'completed',
        records_imported: totalUpserted,
        source_url: sourceUrl,
        finished_at: new Date().toISOString(),
      })
      .eq('id', syncId);

    return { syncId, records: totalUpserted, sourceUrl };
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
    throw err;
  }
}

// Creates the sync row in 'running' state and returns the ID immediately.
// Used by the API route to kick off work via setImmediate and poll status
// from the UI — avoids Render's proxy timing out long syncs.
export async function startGiasSyncAsync(csvOverride?: string): Promise<string> {
  const supabase = createAdminClient();
  const { data: syncRow, error: syncErr } = await supabase
    .from('schools_register_syncs')
    .insert({ status: 'running' })
    .select('id')
    .single();
  if (syncErr) throw new Error(`Failed to start sync: ${syncErr.message}`);
  const syncId = syncRow.id as string;

  setImmediate(() => {
    runGiasSyncBody(syncId, csvOverride).catch((err) => {
      console.error('gov.uk schools sync failed', syncId, err);
    });
  });

  return syncId;
}

// Internal: runs the actual sync work against an existing sync row. The
// runGiasSync above creates+runs in one call (used for synchronous tests);
// this variant lets the API route create the row, return, then run async.
async function runGiasSyncBody(syncId: string, csvOverride?: string): Promise<void> {
  const supabase = createAdminClient();
  try {
    let csv: string;
    let sourceUrl = 'manual-upload';
    if (csvOverride) {
      csv = csvOverride;
    } else {
      const fetched = await fetchGiasCsv();
      csv = fetched.csv;
      sourceUrl = fetched.sourceUrl;
    }

    const rows = parseGiasCsv(csv);
    if (rows.length === 0) {
      throw new Error('Parsed CSV had zero rows — check the file format');
    }

    const now = new Date().toISOString();
    const CHUNK = 2000;
    const CONCURRENCY = 4;
    const chunks: GiasRow[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      chunks.push(rows.slice(i, i + CHUNK));
    }

    let nextChunk = 0;
    let totalUpserted = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
      for (;;) {
        const idx = nextChunk++;
        if (idx >= chunks.length) return;
        const chunk = chunks[idx].map((r) => ({ ...r, last_synced_at: now }));
        const { error } = await supabase
          .from('schools_register')
          .upsert(chunk as unknown as Record<string, unknown>[], { onConflict: 'urn' });
        if (error) throw new Error(`Upsert chunk ${idx} failed: ${error.message}`);
        totalUpserted += chunk.length;
        await supabase
          .from('schools_register_syncs')
          .update({ records_imported: totalUpserted })
          .eq('id', syncId);
      }
    });
    await Promise.all(workers);

    await supabase
      .from('schools_register_syncs')
      .update({
        status: 'completed',
        records_imported: totalUpserted,
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
};

export async function getSchoolsSyncStatus(): Promise<SchoolsSyncStatus> {
  const supabase = createAdminClient();

  // Recover from zombie syncs: if the most-recent row is still 'running' but
  // started more than 5 minutes ago, the worker almost certainly died (e.g.
  // a previous 502 from Render's proxy timing out the route). Mark it failed
  // so the UI stops polling.
  const ZOMBIE_THRESHOLD_MS = 5 * 60 * 1000;
  const { data: latest } = await supabase
    .from('schools_register_syncs')
    .select('id, status, started_at, records_imported')
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
          last_error: 'Worker died before completing (likely a request timeout). Try re-syncing.',
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
      .select('status, last_error, started_at, finished_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const last = (lastSync.data ?? null) as {
    status: 'running' | 'completed' | 'failed';
    last_error: string | null;
    started_at: string;
    finished_at: string | null;
  } | null;
  return {
    totalSchools: totalSchools ?? 0,
    openSchools: openSchools ?? 0,
    lastSyncAt: last?.finished_at ?? last?.started_at ?? null,
    lastSyncStatus: last?.status ?? null,
    lastError: last?.last_error ?? null,
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
