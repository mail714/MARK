'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Re-runs this search's stored criteria as a fresh search, with the option
// to raise the max-results cap — the common case being a sweep that hit
// its cap and left estates unswept. Already-known businesses cost nothing
// on a re-run, so widening is safe.
export function RerunSearchButton({
  searchId,
  currentMaxResults,
  hasPayload,
}: {
  searchId: string;
  currentMaxResults: number | null;
  hasPayload: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [maxResults, setMaxResults] = useState<string>(
    String(currentMaxResults ?? 500),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function rerun() {
    const parsed = parseInt(maxResults, 10);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/chimera/searches/${searchId}/rerun`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          Number.isFinite(parsed) ? { max_results: parsed } : {},
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Re-run failed (${res.status})`);
      setOpen(false);
      router.push(`/chimera/searches/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!hasPayload}
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        title={
          hasPayload
            ? 'Run this search again with the same criteria'
            : 'This search has no stored criteria — start it from the New search form'
        }
      >
        Run again
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="w-full max-w-md rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="space-y-4 p-5">
          <header>
            <h2 className="text-lg font-semibold tracking-tight">Run again</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Same criteria, fresh run. Businesses already in MARK are linked for
              free — Google and scraping costs only apply to new discoveries.
            </p>
          </header>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
              Max results
            </label>
            <input
              type="number"
              min={10}
              max={5000}
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value)}
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10px] text-neutral-500">
              Raise this if the last run stopped at its cap before covering every
              area (e.g. 14 of 52 estates swept). Up to 5,000.
            </p>
          </div>

          {error ? <div className="text-xs text-red-600">{error}</div> : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={rerun}
              disabled={busy}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Run search'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
