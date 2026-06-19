'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const SOURCES = [
  { source: 'honours-boards-case-studies', label: 'Honours Boards case studies' },
  { source: 'signet-signs-products', label: 'Signet Signs products' },
  { source: 'signet-signs-media', label: 'Signet Signs Media folders' },
];

export function SyncImagesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function go(source: string, label: string) {
    setBusy(source);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch('/api/emails/images/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Sync failed (${res.status})`);
      setStatus(`${label}: ${data.fetched} fetched · ${data.inserted} new · ${data.updated} updated`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {SOURCES.map((s) => (
          <button
            key={s.source}
            type="button"
            onClick={() => go(s.source, s.label)}
            disabled={busy !== null}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-wait disabled:bg-neutral-400"
          >
            {busy === s.source ? 'Syncing…' : `Sync ${s.label}`}
          </button>
        ))}
      </div>
      {status ? <span className="text-xs text-neutral-500">{status}</span> : null}
      {error ? <span className="max-w-md text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
