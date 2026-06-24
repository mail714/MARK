'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CsvImportForm() {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setCsv(text);
    if (!label) setLabel(f.name.replace(/\.csv$/i, ''));
  }

  async function submit() {
    if (!csv.trim()) {
      setError('Paste or upload a CSV first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/chimera/searches/csv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv, label: label || 'CSV import' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Import failed (${res.status})`);
      router.push(`/chimera/searches/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="text-xs text-neutral-500">
        Required column: <span className="font-mono">business_name</span>. Optional:{' '}
        <span className="font-mono">address, postcode, phone, website, email</span>. Header names are flexible
        — &quot;Company&quot;, &quot;Site&quot;, &quot;Tel&quot;, &quot;Email(s)&quot; etc. all work.
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Cricket clubs — Cotswolds (2026)"
          className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
          CSV file
        </label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          className="mt-1 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-neutral-700 hover:file:bg-neutral-200"
        />
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
          Or paste CSV
        </label>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          placeholder="business_name,address,postcode,phone,website,email"
          className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 font-mono text-xs shadow-sm focus:border-neutral-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
        {error ? <div className="text-xs text-red-600">{error}</div> : <div />}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
    </div>
  );
}
