'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Props = {
  driveFolderId: string;
  folderName: string;
  isPublished?: boolean;
};

export function DeleteButton({ driveFolderId, folderName, isPublished }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function go() {
    const lines = [
      `Delete "${folderName}"?`,
      '',
      'This will:',
      '• Move the Drive folder and all its contents to Drive trash',
      '• Delete the case study from MARK along with its processed photos',
    ];
    if (isPublished) {
      lines.push(
        '',
        'The published Wix item will NOT be deleted. Use Reset Wix link on the detail page first if you also want the live page gone.',
      );
    }
    const ok = window.confirm(lines.join('\n'));
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/case-studies/by-drive-folder/${encodeURIComponent(driveFolderId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:text-neutral-400"
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
