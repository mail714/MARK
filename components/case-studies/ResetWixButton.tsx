'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function ResetWixButton({
  caseStudyId,
  hasWixItem,
}: {
  caseStudyId: string;
  hasWixItem: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function go() {
    const ok = window.confirm(
      hasWixItem
        ? 'This deletes the live Wix item and clears the link in MARK. The next Publish creates a fresh item with a clean slug. Continue?'
        : 'Clear the Wix link in MARK and reset to draft status?',
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/case-studies/${caseStudyId}/wix`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Reset failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:text-neutral-400"
      >
        {busy ? 'Resetting…' : 'Reset Wix link'}
      </button>
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
