'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function SyncAddressBooksButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function go() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch('/api/emails/address-books/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Sync failed (${res.status})`);
      }
      setStatus(`${data.fetched} fetched • ${data.inserted} new • ${data.updated} updated`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-wait disabled:bg-neutral-400"
      >
        {busy ? 'Syncing…' : 'Sync from dotdigital'}
      </button>
      {status ? <span className="text-xs text-neutral-500">{status}</span> : null}
      {error ? <span className="text-xs text-red-600 max-w-sm">{error}</span> : null}
    </div>
  );
}
