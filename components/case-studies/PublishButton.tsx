'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

type Props = {
  caseStudyId: string;
  status: string;
  hasCopy: boolean;
  hasPhotos: boolean;
  wixPublishedUrl: string | null;
};

type SocialState =
  | { kind: 'idle' }
  | { kind: 'drafting' }
  | { kind: 'done'; count: number }
  | { kind: 'error'; message: string };

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

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [socialPromptOpen, setSocialPromptOpen] = useState(false);
  const [socialState, setSocialState] = useState<SocialState>({ kind: 'idle' });

  const isPublished = status === 'published';
  const blocker = !hasCopy
    ? 'Draft the copy before publishing.'
    : !hasPhotos
      ? 'Process and select photos before publishing.'
      : null;

  // Open / close the prompt via the native dialog API so backdrop + Esc work.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (socialPromptOpen && !d.open) d.showModal();
    if (!socialPromptOpen && d.open) d.close();
  }, [socialPromptOpen]);

  async function publish() {
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
      // Successful publish — prompt the operator to fan out social posts so
      // they don't forget. They can dismiss; if they accept, we kick off the
      // drafter and show progress inside the dialog.
      setSocialState({ kind: 'idle' });
      setSocialPromptOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateSocial() {
    setSocialState({ kind: 'drafting' });
    try {
      const res = await fetch(`/api/social/from-case-study/${caseStudyId}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Generation failed (${res.status})`);
      setSocialState({ kind: 'done', count: data.created?.length ?? 0 });
    } catch (err) {
      setSocialState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={publish}
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

      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40"
        onClose={() => setSocialPromptOpen(false)}
      >
        <div className="space-y-4 p-5">
          <header>
            <div className="text-xs font-medium uppercase tracking-wider text-emerald-700">
              Published ✓
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">
              Generate social posts?
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Fan this case study out into one draft post per platform configured for the brand.
              Drafts land in Social for review and scheduling.
            </p>
          </header>

          {socialState.kind === 'drafting' ? (
            <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              Drafting variants…
            </div>
          ) : null}
          {socialState.kind === 'done' ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              Drafted {socialState.count} post{socialState.count === 1 ? '' : 's'}.
            </div>
          ) : null}
          {socialState.kind === 'error' ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {socialState.message}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {socialState.kind === 'done' ? (
              <>
                <button
                  type="button"
                  onClick={() => setSocialPromptOpen(false)}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Close
                </button>
                <Link
                  href="/social"
                  className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
                >
                  Open Social →
                </Link>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSocialPromptOpen(false)}
                  disabled={socialState.kind === 'drafting'}
                  className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={generateSocial}
                  disabled={socialState.kind === 'drafting'}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {socialState.kind === 'drafting' ? 'Drafting…' : 'Yes, draft them now'}
                </button>
              </>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}
