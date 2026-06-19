'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function DraftEmailButton({
  campaignId,
  hasDraft,
}: {
  campaignId: string;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function go() {
    if (hasDraft) {
      const ok = window.confirm(
        'Re-drafting overwrites the current subject, preheader and body. Continue?',
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/emails/campaigns/${campaignId}/draft`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Draft failed (${res.status})`);
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
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-wait disabled:bg-neutral-400"
      >
        {busy ? 'Drafting…' : hasDraft ? 'Re-draft with AI' : 'Draft with AI'}
      </button>
      {error ? <span className="max-w-md text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
