'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChimeraSearch } from '@/lib/chimera/types';

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  running: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
};

// A running search stops writing to its row only when the process died
// (deploys restart the server and kill in-flight runs) or when every
// worker is stuck in a long scrape timeout. Ten minutes of silence is
// far beyond any legitimate gap, so we surface a stall warning.
const STALL_AFTER_MS = 10 * 60 * 1000;

export function SearchProgress({ initial }: { initial: ChimeraSearch }) {
  const router = useRouter();
  const [search, setSearch] = useState<ChimeraSearch>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [failBusy, setFailBusy] = useState(false);
  const isLive = search.status === 'pending' || search.status === 'running';

  // Sync state to the latest server-rendered prop whenever the parent
  // refreshes — e.g. after a Rescan websites job updates the cached
  // prospects_with_email counter and router.refresh() re-renders the
  // page. Without this, the WITH EMAIL / WITH WEBSITE tiles keep
  // showing the original-search snapshot.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(initial);
  }, [initial]);

  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/chimera/searches/${search.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { search: ChimeraSearch };
        if (cancelled) return;
        setSearch(data.search);
        // Refresh server data when status flips so prospects load.
        if (data.search.status !== 'pending' && data.search.status !== 'running') {
          router.refresh();
        }
      } catch {
        // swallow — next tick retries
      }
    };
    const handle = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [isLive, router, search.id]);

  // Tick a clock while live so the 'last activity' readout stays honest
  // even when the row itself has stopped changing.
  useEffect(() => {
    if (!isLive) return;
    const handle = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(handle);
  }, [isLive]);

  const lastActivityMs = search.updated_at ? now - Date.parse(search.updated_at) : null;
  const stalled = isLive && lastActivityMs !== null && lastActivityMs > STALL_AFTER_MS;

  async function markFailed() {
    setFailBusy(true);
    try {
      const res = await fetch(`/api/chimera/searches/${search.id}/fail`, { method: 'POST' });
      if (res.ok) router.refresh();
    } finally {
      setFailBusy(false);
    }
  }

  const percent =
    search.grid_cells_total && search.grid_cells_total > 0
      ? Math.min(100, Math.round((search.grid_cells_processed / search.grid_cells_total) * 100))
      : null;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ${STATUS_TONE[search.status] ?? STATUS_TONE.pending}`}>
          {search.status}
        </span>
        {isLive ? <span className="text-neutral-500">Live — refreshing every 3s</span> : null}
        {isLive && lastActivityMs !== null ? (
          <span className={stalled ? 'font-medium text-amber-700' : 'text-neutral-400'}>
            Last activity {formatAgo(lastActivityMs)} ago
          </span>
        ) : null}
        {search.last_error ? <span className="text-red-600">Error: {search.last_error}</span> : null}
      </div>

      {stalled ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            This run has stopped updating — usually a server restart mid-run (deploys do
            this). It won&apos;t finish on its own. Mark it failed, then use{' '}
            <strong>Run again</strong>: businesses already processed are skipped for free.
          </span>
          <button
            type="button"
            onClick={markFailed}
            disabled={failBusy}
            className="rounded-md border border-amber-400 bg-white px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {failBusy ? '…' : 'Mark as failed'}
          </button>
        </div>
      ) : null}

      {percent !== null ? (
        <div>
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-neutral-500">
            <span>Grid progress</span>
            <span>
              {search.grid_cells_processed} / {search.grid_cells_total} cells ({percent}%)
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Found" value={search.prospects_found.toLocaleString('en-GB')} />
        <Tile label="With email" value={search.prospects_with_email.toLocaleString('en-GB')} highlight="emerald" />
        <Tile label="With website" value={search.prospects_with_website.toLocaleString('en-GB')} />
        <Tile label="Skipped" value={search.chains_skipped.toLocaleString('en-GB')} highlight="amber" />
      </div>
    </div>
  );
}

function formatAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Tile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'emerald' | 'amber';
}) {
  const tone =
    highlight === 'emerald'
      ? 'border-emerald-200 bg-emerald-50'
      : highlight === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : 'border-neutral-200 bg-neutral-50';
  return (
    <div className={`rounded-md border ${tone} p-3`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">{value}</div>
    </div>
  );
}
