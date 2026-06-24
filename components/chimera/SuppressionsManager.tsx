'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ProspectSuppression } from '@/lib/chimera/types';

export function SuppressionsManager({ initial }: { initial: ProspectSuppression[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [email, setEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!email && !domain && !name) {
      setError('Enter at least one of email, domain or business name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/chimera/suppressions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email || null,
          domain: domain || null,
          business_name: name || null,
          reason: reason || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Add failed (${res.status})`);
      setEmail('');
      setDomain('');
      setName('');
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove from suppression list?')) return;
    const res = await fetch(`/api/chimera/suppressions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setItems(items.filter((i) => i.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Add suppression
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (single contact)"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Domain (e.g. example.com — blocks all emails on it)"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Business name (case-insensitive exact match)"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm sm:col-span-2"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm sm:col-span-2"
          />
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          {error ? <div className="text-xs text-red-600">{error}</div> : <div />}
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Domain</th>
              <th className="px-3 py-2">Business name</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-neutral-500">
                  No suppressions yet.
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2 text-xs text-neutral-700">{s.email ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-neutral-700">{s.domain ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-neutral-700">{s.business_name ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">{s.reason ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
