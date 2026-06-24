'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Status = {
  totalSchools: number;
  openSchools: number;
  lastSyncAt: string | null;
  lastSyncStatus: 'running' | 'completed' | 'failed' | null;
  lastError: string | null;
  lastSourceUrl: string | null;
  recordsImported: number;
};

const GIAS_URL_PATTERN =
  'https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata{YYYYMMDD}.csv';

function fmtDate(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SchoolsSyncCard({ initial }: { initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [busy, setBusy] = useState(initial.lastSyncStatus === 'running');
  const [csvText, setCsvText] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [showUrlOverride, setShowUrlOverride] = useState(false);
  const [urlOverride, setUrlOverride] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const lastTotal = useRef<number>(initial.totalSchools);

  useEffect(() => {
    if (status.lastSyncStatus !== 'running') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/chimera/sources/schools/status', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { status: Status };
        if (cancelled) return;
        setStatus(data.status);
        if (data.status.lastSyncStatus !== 'running') {
          setBusy(false);
          if (data.status.lastSyncStatus === 'completed') {
            const added = data.status.totalSchools - lastTotal.current;
            setMessage(
              added > 0
                ? `Sync complete — ${data.status.totalSchools.toLocaleString('en-GB')} schools (added/updated ${added.toLocaleString('en-GB')}).`
                : `Sync complete — ${data.status.totalSchools.toLocaleString('en-GB')} schools.`,
            );
            router.refresh();
          } else if (data.status.lastSyncStatus === 'failed') {
            setError(data.status.lastError ?? 'Sync failed.');
          }
        }
      } catch {
        // swallow — next tick retries
      }
    };
    const handle = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [status.lastSyncStatus, router]);

  async function kickOff(opts: { csv?: string; sourceUrl?: string } = {}) {
    setBusy(true);
    setError(null);
    setMessage(null);
    lastTotal.current = status.totalSchools;
    try {
      const body: Record<string, string> = {};
      if (opts.csv) body.csv = opts.csv;
      if (opts.sourceUrl) body.source_url = opts.sourceUrl;
      const res = await fetch('/api/chimera/sources/schools/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Sync failed (${res.status})`);
      setStatus((s) => ({ ...s, lastSyncStatus: 'running', lastError: null, recordsImported: 0 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setCsvText(text);
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">gov.uk Schools register</h3>
          <p className="mt-1 text-xs text-neutral-600">
            Local copy of GIAS (Get Information About Schools). Updated daily on gov.uk;
            re-sync periodically to keep MARK current. Free — no API key.
          </p>
        </div>
        <button
          type="button"
          onClick={() => kickOff()}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? 'Syncing…' : status.totalSchools === 0 ? 'Run first sync' : 'Re-sync now'}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Tile label="Total schools" value={status.totalSchools.toLocaleString('en-GB')} />
        <Tile label="Open" value={status.openSchools.toLocaleString('en-GB')} highlight="emerald" />
        <Tile label="Last sync" value={fmtDate(status.lastSyncAt)} small />
      </div>

      {busy ? (
        <div className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Sync running in the background.{' '}
          {status.recordsImported > 0
            ? `${status.recordsImported.toLocaleString('en-GB')} rows imported so far.`
            : 'Starting…'}{' '}
          Safe to leave the page — status updates when complete.
        </div>
      ) : null}
      {status.lastSyncStatus === 'failed' && status.lastError && !busy ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          Last sync failed: {status.lastError}
        </div>
      ) : null}
      {error ? <div className="mt-3 text-xs text-red-600">{error}</div> : null}
      {message ? <div className="mt-3 text-xs text-emerald-700">{message}</div> : null}

      <div className="mt-4 border-t border-neutral-100 pt-3 text-xs">
        <div className="space-y-1 text-neutral-600">
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
              URL pattern:
            </span>{' '}
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] break-all">
              {GIAS_URL_PATTERN}
            </code>
          </div>
          <div className="text-[10px] text-neutral-500">
            Auto-fetch walks back up to 7 days from today, then falls back to scraping{' '}
            <a
              href="https://get-information-schools.service.gov.uk/Downloads"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              the downloads page
            </a>{' '}
            for the current link.
          </div>
          {status.lastSourceUrl ? (
            <div className="text-[10px] text-neutral-500">
              <span className="font-medium uppercase tracking-wider">Last source:</span>{' '}
              {status.lastSourceUrl === 'manual-upload' ? (
                <span className="italic">manual upload</span>
              ) : (
                <a
                  href={status.lastSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all underline"
                >
                  {status.lastSourceUrl}
                </a>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-3">
        <button
          type="button"
          onClick={() => setShowUrlOverride(!showUrlOverride)}
          className="text-xs text-neutral-500 hover:text-neutral-700"
        >
          {showUrlOverride ? '↑ Hide' : '↓ Show'} custom source URL (if gov.uk changes the URL pattern)
        </button>
        {showUrlOverride ? (
          <div className="mt-2 space-y-2">
            <p className="text-[10px] text-neutral-500">
              If gov.uk changes their URL pattern and the auto-fetch breaks, paste a direct CSV URL
              here. MARK fetches it and validates the response looks like a GIAS export before
              importing.
            </p>
            <input
              type="url"
              value={urlOverride}
              onChange={(e) => setUrlOverride(e.target.value)}
              placeholder="https://…/edubasealldata20260624.csv"
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-xs shadow-sm focus:border-neutral-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => kickOff({ sourceUrl: urlOverride.trim() })}
              disabled={busy || !urlOverride.trim()}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {busy ? 'Fetching…' : 'Sync from this URL'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-3">
        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="text-xs text-neutral-500 hover:text-neutral-700"
        >
          {showManual ? '↑ Hide' : '↓ Show'} manual upload (if auto-fetch fails)
        </button>
        {showManual ? (
          <div className="mt-2 space-y-2">
            <p className="text-[10px] text-neutral-500">
              If neither the auto-fetch nor a custom URL works, download the &quot;Establishment
              fields&quot; CSV manually from{' '}
              <a
                href="https://get-information-schools.service.gov.uk/Downloads"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                get-information-schools.service.gov.uk/Downloads
              </a>{' '}
              and upload it here.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-neutral-700 hover:file:bg-neutral-200"
            />
            <button
              type="button"
              onClick={() => kickOff({ csv: csvText })}
              disabled={busy || !csvText}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {busy ? 'Importing…' : 'Import uploaded CSV'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  highlight,
  small,
}: {
  label: string;
  value: string;
  highlight?: 'emerald';
  small?: boolean;
}) {
  const tone =
    highlight === 'emerald' ? 'border-emerald-200 bg-emerald-50' : 'border-neutral-200 bg-neutral-50';
  return (
    <div className={`rounded-md border ${tone} p-3`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`mt-1 font-semibold tracking-tight text-neutral-900 ${small ? 'text-sm' : 'text-xl'}`}>
        {value}
      </div>
    </div>
  );
}
