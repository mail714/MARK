'use client';

import { useState } from 'react';
import type { SocialPlatform } from '@/lib/social/platforms';

type Props = {
  brandId: string;
  platform: SocialPlatform;
  initial: {
    handle: string | null;
    profile_url: string | null;
    notes: string | null;
  };
};

export function AccountRowEditor({ brandId, platform, initial }: Props) {
  const [handle, setHandle] = useState(initial.handle ?? '');
  const [profileUrl, setProfileUrl] = useState(initial.profile_url ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Partial<{ handle: string; profile_url: string; notes: string }>, fieldKey: string) {
    setSavingField(fieldKey);
    setError(null);
    try {
      const res = await fetch('/api/social/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brand_id: brandId,
          platform,
          handle,
          profile_url: profileUrl,
          notes,
          ...patch,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingField(null);
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_2fr_2fr] sm:items-start">
      <div>
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onBlur={() => handle !== (initial.handle ?? '') && save({ handle }, 'handle')}
          placeholder="@handle"
          className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
        />
        <div className="mt-0.5 h-3 text-[10px] text-neutral-400">
          {savingField === 'handle' ? 'Saving…' : ''}
        </div>
      </div>
      <div>
        <input
          type="url"
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
          onBlur={() => profileUrl !== (initial.profile_url ?? '') && save({ profile_url: profileUrl }, 'profile_url')}
          placeholder="https://..."
          className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
        />
        <div className="mt-0.5 h-3 text-[10px] text-neutral-400">
          {savingField === 'profile_url' ? 'Saving…' : ''}
        </div>
      </div>
      <div>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (initial.notes ?? '') && save({ notes }, 'notes')}
          placeholder="Notes (optional)"
          className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
        />
        <div className="mt-0.5 h-3 text-[10px] text-neutral-400">
          {savingField === 'notes' ? 'Saving…' : error ? <span className="text-red-600">{error}</span> : ''}
        </div>
      </div>
    </div>
  );
}
