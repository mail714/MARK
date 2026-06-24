'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  Prospect,
  ProspectAssignmentStatus,
  ProspectBrandAssignment,
} from '@/lib/chimera/types';

type Brand = { id: string; slug: string; name: string };
type AddressBook = { dotdigital_id: number; name: string; contact_count: number | null };
type Row = Prospect & { assignments: ProspectBrandAssignment[] };

export function ProspectsReview({
  prospects,
  brands,
  addressBooks,
}: {
  prospects: Row[];
  brands: Brand[];
  addressBooks: AddressBook[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [brandId, setBrandId] = useState<string>(brands[0]?.id ?? '');
  const [sector, setSector] = useState<string>('');
  const [status, setStatus] = useState<ProspectAssignmentStatus>('approved');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pushBookId, setPushBookId] = useState<number | null>(addressBooks[0]?.dotdigital_id ?? null);
  const [filter, setFilter] = useState<'all' | 'with-email' | 'no-email'>('all');

  const filtered = useMemo(() => {
    if (filter === 'with-email') return prospects.filter((p) => p.emails.length > 0);
    if (filter === 'no-email') return prospects.filter((p) => p.emails.length === 0);
    return prospects;
  }, [prospects, filter]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  }

  async function bulkAssign() {
    if (selected.size === 0 || !brandId) {
      setError('Select prospects and pick a brand.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/chimera/prospects/bulk-assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prospect_ids: [...selected],
          brand_id: brandId,
          sector: sector || null,
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Assign failed (${res.status})`);
      setMessage(`Assigned ${data.count} prospect${data.count === 1 ? '' : 's'} to ${brands.find((b) => b.id === brandId)?.name}.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function pushToBook() {
    if (selected.size === 0 || !brandId || !pushBookId) {
      setError('Select prospects, a brand and a dotdigital book.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/chimera/prospects/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prospect_ids: [...selected],
          brand_id: brandId,
          address_book_id: pushBookId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Push failed (${res.status})`);
      setMessage(`Pushed ${data.pushed} · failed ${data.failed} · skipped ${data.skipped}.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const counts = {
    withEmail: prospects.filter((p) => p.emails.length > 0).length,
    total: prospects.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-xs">
        <div className="flex items-center gap-3 text-neutral-600">
          <span>
            <strong className="text-neutral-900">{counts.withEmail}</strong> with email
            <span className="text-neutral-400"> / {counts.total} total</span>
          </span>
          <span className="text-neutral-300">·</span>
          <span>
            <strong className="text-neutral-900">{selected.size}</strong> selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wider text-neutral-500">Filter</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
          >
            <option value="all">All</option>
            <option value="with-email">With email</option>
            <option value="no-email">No email</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Brand">
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
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
            placeholder="e.g. Cricket clubs"
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProspectAssignmentStatus)}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
          >
            <option value="new">New (queue)</option>
            <option value="approved">Approved</option>
            <option value="skipped">Skip</option>
          </select>
        </Field>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={bulkAssign}
            disabled={busy || selected.size === 0}
            className="flex-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Assign
          </button>
        </div>
        <Field label="dotdigital book">
          <select
            value={pushBookId ?? ''}
            onChange={(e) => setPushBookId(parseInt(e.target.value, 10) || null)}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs"
          >
            <option value="">— pick book —</option>
            {addressBooks.map((b) => (
              <option key={b.dotdigital_id} value={b.dotdigital_id}>
                {b.name} ({b.contact_count ?? '—'})
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-3 flex items-end gap-2">
          <button
            type="button"
            onClick={pushToBook}
            disabled={busy || selected.size === 0 || !pushBookId}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            Push selected → dotdigital
          </button>
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
          {message ? <div className="text-xs text-emerald-700">{message}</div> : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === filtered.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2">Address</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Email(s)</th>
              <th className="px-3 py-2">Assigned</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-neutral-100 align-top hover:bg-neutral-50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs font-medium text-neutral-800">{p.business_name}</div>
                  {p.website ? (
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noreferrer"
                      className="block max-w-xs truncate text-[10px] text-neutral-500 hover:underline"
                    >
                      {p.website}
                    </a>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-600">
                  <div className="max-w-xs">{p.address ?? '—'}</div>
                  {p.address_note ? (
                    <div className="mt-0.5 text-[10px] text-neutral-400">{p.address_note}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-600">{p.phone ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-neutral-700">
                  {p.emails.length === 0 ? <span className="text-neutral-400">—</span> : null}
                  {p.emails.map((e) => (
                    <div key={e} className="truncate font-mono text-[11px]">{e}</div>
                  ))}
                </td>
                <td className="px-3 py-2 text-xs">
                  {p.assignments.length === 0 ? (
                    <span className="text-neutral-400">—</span>
                  ) : (
                    <div className="space-y-0.5">
                      {p.assignments.map((a) => {
                        const brand = brands.find((b) => b.id === a.brand_id);
                        return (
                          <div key={a.id} className="flex items-center gap-1">
                            <span className="rounded-full bg-neutral-100 px-1.5 py-0 text-[10px] ring-1 ring-neutral-200">
                              {brand?.name ?? a.brand_id.slice(0, 6)}
                            </span>
                            <span className="text-[10px] text-neutral-500">{a.status}</span>
                            {a.sector ? (
                              <span className="text-[10px] text-neutral-400">· {a.sector}</span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <div className="border-t border-neutral-100 p-6 text-center text-xs text-neutral-500">
            No prospects matching this filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
