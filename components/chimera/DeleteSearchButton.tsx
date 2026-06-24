'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeleteSearchButton({
  searchId,
  label,
  redirectTo,
  variant = 'inline',
}: {
  searchId: string;
  label: string;
  redirectTo?: string;
  variant?: 'inline' | 'button';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete search "${label}"? Prospects it found will stay; only the search log is removed.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/chimera/searches/${searchId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? 'Deleting…' : 'Delete this search'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="text-xs text-red-600 hover:underline disabled:opacity-50"
    >
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
