'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Brand = { id: string; slug: string; name: string };
type AddressBook = { dotdigital_id: number; name: string; contact_count: number | null };

export function SaveSearchButton({
  defaultName,
  defaultBrandId,
  defaultSector,
  payload,
  brands,
  addressBooks,
}: {
  searchId?: string;
  defaultName: string;
  defaultBrandId?: string | null;
  defaultSector?: string | null;
  // The original payload that produced this search. Stored on the saved
  // segment so 'Run again' re-executes the same query against fresh data.
  payload: Record<string, unknown> | null;
  brands: Brand[];
  addressBooks: AddressBook[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [brandId, setBrandId] = useState(defaultBrandId ?? brands[0]?.id ?? '');
  const [sector, setSector] = useState(defaultSector ?? '');
  const [bookId, setBookId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function save() {
    if (!payload) {
      setError(
        'This search has no saved payload — it was created before saved segments existed. Re-run it from the New search form and save then.',
      );
      return;
    }
    if (!name.trim() || !brandId) {
      setError('Name and brand are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/chimera/saved', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          brand_id: brandId,
          sector: sector || null,
          dotdigital_book_id: bookId,
          payload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      setOpen(false);
      router.push('/chimera/saved');
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
        className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        title={
          payload
            ? `Save this search's criteria as a reusable segment`
            : 'This search has no saved payload — re-run via /chimera/searches/new'
        }
      >
        Save as segment
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="w-full max-w-md rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="space-y-4 p-5">
          <header>
            <h2 className="text-lg font-semibold tracking-tight">Save as segment</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Re-run anytime against the latest data. Optionally sync new matches into a dotdigital
              address book.
            </p>
          </header>

          <Field label="Segment name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Primary schools — Bristol"
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Brand">
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Sector (optional)">
              <input
                type="text"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="e.g. Schools"
                className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label="dotdigital book (optional)">
            <select
              value={bookId ?? ''}
              onChange={(e) => setBookId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">— not bound —</option>
              {addressBooks.map((b) => (
                <option key={b.dotdigital_id} value={b.dotdigital_id}>
                  {b.name} ({b.contact_count ?? '—'})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-neutral-500">
              When bound, the &quot;Sync to book&quot; action on the saved segment adds new
              prospects from the latest run into this book. Existing contacts are untouched.
            </p>
          </Field>

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
              onClick={save}
              disabled={busy || !payload}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save segment'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
