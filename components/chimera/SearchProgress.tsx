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

export function SearchProgress({ initial }: { initial: ChimeraSearch }) {
  const router = useRouter();
  const [search, setSearch] = useState<ChimeraSearch>(initial);
  const isLive = search.status === 'pending' || search.status === 'running';

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
        {search.last_error ? <span className="text-red-600">Error: {search.last_error}</span> : null}
      </div>

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
