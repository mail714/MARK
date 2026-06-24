'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SavedSearch } from '@/lib/chimera/saved';

type Brand = { id: string; slug: string; name: string };
type AddressBook = { dotdigital_id: number; name: string };

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

export function SavedSearchesList({
  initial,
  brands,
  addressBooks,
}: {
  initial: SavedSearch[];
  brands: Brand[];
  addressBooks: AddressBook[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const brandsById = new Map(brands.map((b) => [b.id, b]));
  const booksById = new Map(addressBooks.map((b) => [b.dotdigital_id, b]));

  async function runNow(s: SavedSearch) {
    setBusyId(s.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/chimera/saved/${s.id}/run`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Run failed (${res.status})`);
      router.push(`/chimera/searches/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusyId(null);
    }
  }

  async function pushToBook(s: SavedSearch) {
    if (!s.dotdigital_book_id) {
      setError('No dotdigital book bound to this segment. Edit it to bind one.');
      return;
    }
    if (!s.last_run_search_id) {
      setError('No runs yet — hit Run now first.');
      return;
    }
    if (
      !confirm(
        `Push prospects from the latest run of "${s.name}" into the bound dotdigital book? New contacts will be added; existing ones aren't touched.`,
      )
    ) {
      return;
    }
    setBusyId(s.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/chimera/saved/${s.id}/push`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Push failed (${res.status})`);
      setMessage(
        `Pushed ${data.pushed ?? 0} · skipped ${data.skipped ?? 0} · failed ${data.failed ?? 0}.`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteSaved(s: SavedSearch) {
    if (!confirm(`Delete segment "${s.name}"? Past runs and prospects are kept.`)) return;
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/chimera/saved/${s.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      setItems(items.filter((x) => x.id !== s.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function rebindBook(s: SavedSearch, bookId: number | null) {
    setBusyId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/chimera/saved/${s.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dotdigital_book_id: bookId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Update failed (${res.status})`);
      }
      setItems(items.map((x) => (x.id === s.id ? { ...x, dotdigital_book_id: bookId } : x)));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
        No saved segments yet. Run a search from{' '}
        <Link href="/chimera/searches/new" className="underline">
          /chimera/searches/new
        </Link>{' '}
        and hit <strong>Save as segment</strong> on the result page.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
      {message ? <div className="text-xs text-emerald-700">{message}</div> : null}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-3 py-2">Segment</th>
              <th className="px-3 py-2">Brand · Sector</th>
              <th className="px-3 py-2">dotdigital book</th>
              <th className="px-3 py-2">Last run</th>
              <th className="px-3 py-2 text-right">Last count</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const brand = brandsById.get(s.brand_id);
              const book = s.dotdigital_book_id ? booksById.get(s.dotdigital_book_id) : null;
              const isBusy = busyId === s.id;
              return (
                <tr key={s.id} className="border-t border-neutral-100 align-top">
                  <td className="px-3 py-2">
                    <div className="text-xs font-medium text-neutral-800">{s.name}</div>
                    {s.last_run_search_id ? (
                      <Link
                        href={`/chimera/searches/${s.last_run_search_id}`}
                        className="block text-[10px] text-neutral-500 hover:underline"
                      >
                        View latest run →
                      </Link>
                    ) : (
                      <div className="text-[10px] text-neutral-400">No runs yet</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600">
                    {brand?.name ?? '—'}
                    {s.sector ? <span className="text-neutral-400"> · {s.sector}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={s.dotdigital_book_id ?? ''}
                      onChange={(e) => rebindBook(s, e.target.value ? parseInt(e.target.value, 10) : null)}
                      disabled={isBusy}
                      className="w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="">— not bound —</option>
                      {addressBooks.map((b) => (
                        <option key={b.dotdigital_id} value={b.dotdigital_id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    {book ? null : <div className="mt-0.5 text-[10px] text-neutral-400">No push target</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600">{fmtDate(s.last_run_at)}</td>
                  <td className="px-3 py-2 text-right text-xs text-neutral-700">
                    {s.last_run_prospects?.toLocaleString('en-GB') ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => runNow(s)}
                        disabled={isBusy}
                        className="rounded-md bg-neutral-900 px-2 py-1 text-[10px] font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                      >
                        {isBusy ? '…' : 'Run now'}
                      </button>
                      <button
                        type="button"
                        onClick={() => pushToBook(s)}
                        disabled={isBusy || !s.dotdigital_book_id || !s.last_run_search_id}
                        className="rounded-md bg-emerald-700 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        Sync to book
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSaved(s)}
                        disabled={isBusy}
                        className="text-[10px] text-red-600 hover:underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
