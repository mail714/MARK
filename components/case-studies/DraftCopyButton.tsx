'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function DraftCopyButton({
  caseStudyId,
  hasDraft,
}: {
  caseStudyId: string;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/case-studies/${caseStudyId}/draft`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Drafting failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-wait disabled:bg-neutral-400"
      >
        {busy ? 'Drafting…' : hasDraft ? 'Re-draft copy' : 'Draft copy with AI'}
      </button>
      {error ? <span className="text-xs text-red-600 max-w-md">{error}</span> : null}
    </div>
  );
}
