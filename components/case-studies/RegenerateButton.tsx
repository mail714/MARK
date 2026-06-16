'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function RegenerateButton({ driveFolderId }: { driveFolderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function go() {
    const ok = window.confirm(
      'Regenerating will re-extract the spec from the PDFs and re-run the AI copy draft from scratch. Any inline edits you have made to the spec or copy fields will be overwritten. Continue?',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/case-studies/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ driveFolderId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Regeneration failed (${res.status})`);
      }
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
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-wait disabled:text-neutral-400"
      >
        {busy ? 'Regenerating…' : 'Regenerate spec + copy'}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
