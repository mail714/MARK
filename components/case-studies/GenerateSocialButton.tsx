'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function GenerateSocialButton({ caseStudyId }: { caseStudyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ count: number } | null>(null);
  const [, startTransition] = useTransition();

  async function go() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/social/from-case-study/${caseStudyId}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Generation failed (${res.status})`);
      setDone({ count: data.created?.length ?? 0 });
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
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-50"
      >
        {busy ? 'Drafting…' : 'Generate social variants'}
      </button>
      {done ? (
        <Link href="/social" className="text-xs text-emerald-700 hover:underline">
          Drafted {done.count} post{done.count === 1 ? '' : 's'} — open Social →
        </Link>
      ) : null}
      {error ? <span className="max-w-md text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
