'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';

type Brand = { id: string; slug: string; name: string };

export function NewCampaignButton({ brands }: { brands: Brand[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [brandId, setBrandId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function open() {
    setName('');
    setBrandId('');
    setError(null);
    dialogRef.current?.showModal();
  }
  function close() {
    if (busy) return;
    dialogRef.current?.close();
  }

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Internal name is required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/emails/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          internal_name: name.trim(),
          brand_id: brandId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      const { id } = (await res.json()) as { id: string };
      dialogRef.current?.close();
      startTransition(() => router.push(`/emails/campaigns/${id}`));
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
        onClick={open}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
      >
        New campaign
      </button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="space-y-4 p-6">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">New campaign</h3>
            <p className="mt-1 text-xs text-neutral-500">
              Start a fresh draft. You can tweak everything on the next page.
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
                Internal name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                placeholder="e.g. Schools — June newsletter"
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
                Brand (optional, change later)
              </label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
              >
                <option value="">— not set —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !name.trim()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {busy ? 'Creating…' : 'Create draft'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
