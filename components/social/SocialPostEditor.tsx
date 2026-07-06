'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toLocalInputValue } from '@/lib/datetime-local';
import type { SocialPost } from '@/lib/social/posts';

type Props = {
  post: SocialPost;
};

export function SocialPostEditor({ post }: Props) {
  const router = useRouter();
  const [caption, setCaption] = useState(post.caption ?? '');
  const [hashtags, setHashtags] = useState(post.hashtags.join(' '));
  const [ctaUrl, setCtaUrl] = useState(post.cta_url ?? '');
  const [shotBrief, setShotBrief] = useState(post.shot_brief ?? '');
  // Local-time formatting is load-bearing: toISOString() renders UTC,
  // which the save path re-parses as local — shifting the publish time an
  // hour on every blur during BST.
  const [plannedAt, setPlannedAt] = useState(
    post.planned_publish_at ? toLocalInputValue(post.planned_publish_at) : '',
  );
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function save(field: string, value: unknown) {
    setSavingField(field);
    setError(null);
    try {
      const res = await fetch(`/api/social/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingField(null);
    }
  }

  function parseHashtags(input: string): string[] {
    return input
      .split(/[\s,]+/)
      .map((h) => h.replace(/^#/, '').trim().toLowerCase())
      .filter(Boolean);
  }

  async function setStatus(next: SocialPost['status']) {
    await save('status', next);
  }

  async function deletePost() {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    const res = await fetch(`/api/social/posts/${post.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/social');
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Delete failed');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
          Caption
        </label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => caption !== (post.caption ?? '') && save('caption', caption)}
          rows={8}
          className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
        />
        <div className="mt-0.5 h-3 text-[10px] text-neutral-400">
          {savingField === 'caption' ? 'Saving…' : `${caption.length} chars`}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
          Hashtags
        </label>
        <input
          type="text"
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          onBlur={() => {
            const next = parseHashtags(hashtags);
            if (next.join(' ') !== post.hashtags.join(' ')) save('hashtags', next);
            setHashtags(next.join(' '));
          }}
          placeholder="cricketclub honoursboard oak"
          className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
        />
        <p className="mt-0.5 text-[10px] text-neutral-400">
          Space-separated. No # prefix needed. {savingField === 'hashtags' ? 'Saving…' : ''}
        </p>
      </div>

      {post.media_urls.length > 0 ? (
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
            Media ({post.media_kind ?? 'unspecified'})
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {post.media_urls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${url}-${i}`}
                src={url}
                alt={post.media_alts[i] ?? ''}
                className="h-24 w-24 rounded-md object-cover ring-1 ring-neutral-200"
              />
            ))}
          </div>
        </div>
      ) : null}

      {post.shot_brief !== null || post.media_kind === 'video' ? (
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
            Shoot brief
          </label>
          <textarea
            value={shotBrief}
            onChange={(e) => setShotBrief(e.target.value)}
            onBlur={() =>
              shotBrief !== (post.shot_brief ?? '') && save('shot_brief', shotBrief || null)
            }
            rows={3}
            placeholder="What to film / shoot to use with this caption."
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          />
          <p className="mt-0.5 text-[10px] text-neutral-400">
            {savingField === 'shot_brief' ? 'Saving…' : 'For platforms that need video before publishing.'}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
            Link URL
          </label>
          <input
            type="url"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            onBlur={() => ctaUrl !== (post.cta_url ?? '') && save('cta_url', ctaUrl || null)}
            placeholder="https://..."
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
            Planned publish
          </label>
          <input
            type="datetime-local"
            value={plannedAt}
            onChange={(e) => setPlannedAt(e.target.value)}
            onBlur={() => {
              const iso = plannedAt ? new Date(plannedAt).toISOString() : null;
              const initIso = post.planned_publish_at
                ? new Date(post.planned_publish_at).toISOString()
                : null;
              if (iso !== initIso) save('planned_publish_at', iso);
            }}
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
        <div className="flex flex-wrap gap-2">
          {post.status !== 'approved' ? (
            <button
              type="button"
              onClick={() => setStatus('approved')}
              disabled={savingField === 'status'}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Approve
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStatus('draft')}
              disabled={savingField === 'status'}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Move back to draft
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={deletePost}
          className="text-xs text-red-600 hover:underline"
        >
          Delete
        </button>
      </div>

      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
