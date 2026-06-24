'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Status = {
  totalSchools: number;
  openSchools: number;
  lastSyncAt: string | null;
  lastSyncStatus: 'running' | 'completed' | 'failed' | null;
  lastError: string | null;
};

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
  const [busy, setBusy] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshStatus() {
    try {
      const res = await fetch('/api/chimera/sources/schools/status', { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as { status: Status };
        setStatus(data.status);
      }
    } catch {
      // ignore
    }
  }

  async function sync(csv?: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/chimera/sources/schools/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: csv ? JSON.stringify({ csv }) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Sync failed (${res.status})`);
      setMessage(`Synced ${data.records?.toLocaleString('en-GB') ?? '?'} records.`);
      await refreshStatus();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
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
          onClick={() => sync()}
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

      {status.lastSyncStatus === 'failed' && status.lastError ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          Last sync failed: {status.lastError}
        </div>
      ) : null}
      {error ? <div className="mt-3 text-xs text-red-600">{error}</div> : null}
      {message ? <div className="mt-3 text-xs text-emerald-700">{message}</div> : null}

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
              If the auto-fetch can&apos;t reach gov.uk (rare), download the &quot;Establishment
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
              onClick={() => sync(csvText)}
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
