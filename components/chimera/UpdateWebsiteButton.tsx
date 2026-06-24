'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type CheckResult = {
  ok: boolean;
  source: 'direct' | 'scrapingbee' | 'failed';
  finalUrl: string | null;
  bytes: number;
  directError: string | null;
  scrapingBeeError: string | null;
  normalisedUrl: string;
};

export function UpdateWebsiteButton({
  prospectId,
  currentUrl,
  businessName,
}: {
  prospectId: string;
  currentUrl: string | null;
  businessName: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(currentUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(currentUrl ?? '');
    setCheck(null);
    setError(null);
  }, [currentUrl, open]);

  async function runCheck() {
    if (!url.trim()) {
      setError('Enter a URL first.');
      return;
    }
    setBusy(true);
    setError(null);
    setCheck(null);
    try {
      const res = await fetch('/api/chimera/check-website', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Check failed (${res.status})`);
      setCheck(data as CheckResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!url.trim()) {
      setError('Enter a URL first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/chimera/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ website: url.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      setOpen(false);
      router.refresh();
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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="text-[10px] text-neutral-500 hover:text-neutral-700 hover:underline"
        title="Replace the stored website URL — useful when GIAS has a dead link or the trust URL not the school URL"
      >
        Update website
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="w-full max-w-md rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="space-y-4 p-5">
          <header>
            <h2 className="text-lg font-semibold tracking-tight">Update website</h2>
            <p className="mt-1 text-xs text-neutral-500 break-words">{businessName}</p>
          </header>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
              Website URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.school.org.uk"
              className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-mono"
            />
            {currentUrl ? (
              <p className="mt-1 break-all text-[10px] text-neutral-400">
                Current: {currentUrl}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runCheck}
              disabled={busy || !url.trim()}
              className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {busy && !check ? 'Checking…' : 'Test URL'}
            </button>
            {check ? (
              <span
                className={`text-xs ${
                  check.ok
                    ? check.source === 'direct'
                      ? 'text-emerald-700'
                      : 'text-violet-700'
                    : 'text-red-700'
                }`}
              >
                {check.ok
                  ? `Reachable (${check.source}, ${check.bytes.toLocaleString('en-GB')} bytes${
                      check.finalUrl && check.finalUrl !== check.normalisedUrl
                        ? ` → ${check.finalUrl}`
                        : ''
                    })`
                  : `Unreachable: ${check.directError ?? ''}${check.scrapingBeeError ? ` · SB: ${check.scrapingBeeError}` : ''}`}
              </span>
            ) : null}
          </div>

          {error ? <div className="text-xs text-red-600">{error}</div> : null}

          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !url.trim()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
