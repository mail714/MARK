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

type FindResult = {
  ok: boolean;
  query: string;
  candidate: {
    name: string;
    address: string | null;
    phone: string | null;
    website: string | null;
    types: string[];
    matchedPostcode: boolean;
    matchedPhone: boolean;
    confidence: 'high' | 'medium' | 'low';
  } | null;
  reason: string | null;
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
  const [find, setFind] = useState<FindResult | null>(null);
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
    setFind(null);
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

  async function autoFind() {
    setBusy(true);
    setError(null);
    setFind(null);
    setCheck(null);
    try {
      const res = await fetch(`/api/chimera/prospects/${prospectId}/find-website`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Find failed (${res.status})`);
      setFind(data as FindResult);
      // Pre-fill the URL field if we found a website, so the operator can
      // edit / verify / save without re-typing.
      if (data.candidate?.website) {
        setUrl(data.candidate.website);
      }
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={autoFind}
              disabled={busy}
              className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              title="Search Google Places by name + postcode and pre-fill the URL field with the best match"
            >
              {busy && !find && !check ? 'Searching…' : 'Auto-find via Google'}
            </button>
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

          {find ? (
            <div
              className={`space-y-1 rounded-md border px-3 py-2 text-xs ${
                find.candidate?.confidence === 'high'
                  ? 'border-emerald-200 bg-emerald-50'
                  : find.candidate?.confidence === 'medium'
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-neutral-200 bg-neutral-50'
              }`}
            >
              {find.candidate ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-semibold">{find.candidate.name}</span>
                    <span className="text-[10px] uppercase tracking-wider">
                      {find.candidate.confidence} confidence
                    </span>
                  </div>
                  {find.candidate.address ? (
                    <div className="text-neutral-700">{find.candidate.address}</div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 text-[10px] text-neutral-600">
                    {find.candidate.matchedPhone ? (
                      <span className="text-emerald-700">✓ phone matches</span>
                    ) : null}
                    {find.candidate.matchedPostcode ? (
                      <span className="text-emerald-700">✓ postcode matches</span>
                    ) : null}
                    {!find.candidate.matchedPhone && !find.candidate.matchedPostcode ? (
                      <span className="text-amber-700">⚠ neither phone nor postcode matched — double check</span>
                    ) : null}
                  </div>
                  {find.candidate.website ? (
                    <div className="text-[10px] break-all text-neutral-500">
                      Google&apos;s website: {find.candidate.website}
                    </div>
                  ) : (
                    <div className="text-[10px] text-neutral-500">
                      Google has no website listed for this place.
                    </div>
                  )}
                </>
              ) : (
                <div className="text-neutral-700">
                  No match found — {find.reason ?? 'try editing the URL manually'}.
                </div>
              )}
            </div>
          ) : null}

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
