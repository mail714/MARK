'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Props = {
  caseStudyId: string;
  status: string;
  hasCopy: boolean;
  hasPhotos: boolean;
  wixPublishedUrl: string | null;
};

export function PublishButton({
  caseStudyId,
  status,
  hasCopy,
  hasPhotos,
  wixPublishedUrl,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const isPublished = status === 'published';
  const blocker = !hasCopy
    ? 'Draft the copy before publishing.'
    : !hasPhotos
      ? 'Process and select photos before publishing.'
      : null;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/case-studies/${caseStudyId}/publish`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Publish failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={go}
          disabled={busy || !!blocker}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {busy
            ? 'Publishing…'
            : isPublished
              ? 'Re-publish to Wix'
              : 'Publish to Wix'}
        </button>
        {isPublished && wixPublishedUrl ? (
          <a
            href={wixPublishedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-neutral-700 underline-offset-2 hover:underline"
          >
            View live →
          </a>
        ) : null}
      </div>
      {blocker && !error ? (
        <div className="text-xs text-neutral-500">{blocker}</div>
      ) : null}
      {error ? <div className="text-xs text-red-600 max-w-md">{error}</div> : null}
    </div>
  );
}
