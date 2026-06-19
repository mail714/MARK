'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type Props = {
  campaignId: string;
  canPush: boolean;
  status: string;
  dotdigitalCampaignId: number | null;
};

export function PushButton({ campaignId, canPush, status, dotdigitalCampaignId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const isPushed = status === 'pushed';

  async function go() {
    if (isPushed) {
      const ok = window.confirm(
        'This campaign was already pushed to dotdigital. Push again creates a NEW draft in dotdigital with the current content. Continue?',
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/emails/campaigns/${campaignId}/push`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Push failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={go}
          disabled={busy || !canPush}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {busy
            ? 'Pushing…'
            : isPushed
              ? 'Push fresh draft to dotdigital'
              : 'Push to dotdigital'}
        </button>
        {isPushed && dotdigitalCampaignId ? (
          <span className="text-xs text-neutral-500">
            Live in dotdigital · campaign #{dotdigitalCampaignId}
          </span>
        ) : null}
      </div>
      {!canPush ? (
        <span className="text-xs text-neutral-500">Fix the red items below to enable Push.</span>
      ) : null}
      {error ? <span className="max-w-md text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
