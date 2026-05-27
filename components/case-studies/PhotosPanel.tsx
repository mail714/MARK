'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { CaseStudyPhoto } from '@/lib/case-study-photos';

type Props = {
  caseStudyId: string;
  photos: CaseStudyPhoto[];
};

export function PhotosPanel({ caseStudyId, photos }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const main = photos.find((p) => p.role === 'main') ?? null;
  const image2 = photos.find((p) => p.role === 'image_2') ?? null;

  async function processPhotos() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/case-studies/${caseStudyId}/photos`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function promote(photoId: string, role: 'main' | 'image_2') {
    setError(null);
    try {
      const res = await fetch(`/api/case-studies/${caseStudyId}/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveAlt(photoId: string, altText: string) {
    setError(null);
    try {
      const res = await fetch(`/api/case-studies/${caseStudyId}/photos/${photoId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alt_text: altText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Photos
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            All photos in the Drive folder are resized to 1200×900 and stored.
            Claude picks the best hero shot and the best detail shot — click any
            other candidate to promote it.
          </p>
        </div>
        <button
          type="button"
          onClick={processPhotos}
          disabled={busy}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-wait disabled:bg-neutral-400"
        >
          {busy ? 'Processing…' : photos.length > 0 ? 'Re-pick photos' : 'Process photos'}
        </button>
      </div>
      {error ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {photos.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
          No photos processed yet. Click <strong>Process photos</strong> once
          install photos are in the Drive folder.
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Selected
              key={`main-${main?.id ?? 'none'}-${main?.alt_text ?? ''}`}
              label="Main image (hero)"
              photo={main}
              onAltChange={(text) => main && saveAlt(main.id, text)}
            />
            <Selected
              key={`img2-${image2?.id ?? 'none'}-${image2?.alt_text ?? ''}`}
              label="Image 2 (detail)"
              photo={image2}
              onAltChange={(text) => image2 && saveAlt(image2.id, text)}
            />
          </div>

          {photos.length > 2 ? (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                All candidates
              </h3>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {photos.map((p) => (
                  <Candidate
                    key={p.id}
                    photo={p}
                    onPromote={(role) => promote(p.id, role)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Selected({
  label,
  photo,
  onAltChange,
}: {
  label: string;
  photo: CaseStudyPhoto | null;
  onAltChange: (text: string) => void;
}) {
  const [alt, setAlt] = useState(photo?.alt_text ?? '');
  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      {photo?.processed_public_url ? (
        <div className="relative aspect-[4/3] overflow-hidden rounded">
          <Image
            src={photo.processed_public_url}
            alt={alt || label}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 50vw"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded bg-neutral-100 text-xs text-neutral-500">
          Not selected
        </div>
      )}
      <textarea
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        onBlur={() => alt !== (photo?.alt_text ?? '') && onAltChange(alt)}
        placeholder="Alt text (80–140 characters)"
        rows={2}
        disabled={!photo}
        className="w-full rounded border border-neutral-200 px-2 py-1 text-xs disabled:bg-neutral-50"
      />
      <div className="text-[10px] text-neutral-400">
        {photo?.original_filename ?? ''}
      </div>
    </div>
  );
}

function Candidate({
  photo,
  onPromote,
}: {
  photo: CaseStudyPhoto;
  onPromote: (role: 'main' | 'image_2') => void;
}) {
  const isMain = photo.role === 'main';
  const isImage2 = photo.role === 'image_2';
  return (
    <div
      className={`relative overflow-hidden rounded border ${
        isMain || isImage2 ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-neutral-200'
      }`}
    >
      {photo.processed_public_url ? (
        <div className="relative aspect-[4/3]">
          <Image
            src={photo.processed_public_url}
            alt={photo.alt_text ?? photo.original_filename ?? 'Candidate'}
            fill
            className="object-cover"
            sizes="200px"
            unoptimized
          />
        </div>
      ) : (
        <div className="aspect-[4/3] bg-neutral-100" />
      )}
      <div className="absolute inset-x-0 bottom-0 flex divide-x divide-white/30 bg-black/55 text-[10px] text-white">
        <button
          type="button"
          onClick={() => onPromote('main')}
          disabled={isMain}
          className="flex-1 px-1 py-1 hover:bg-black/70 disabled:bg-emerald-700/80"
        >
          {isMain ? '✓ Main' : 'Make main'}
        </button>
        <button
          type="button"
          onClick={() => onPromote('image_2')}
          disabled={isImage2}
          className="flex-1 px-1 py-1 hover:bg-black/70 disabled:bg-emerald-700/80"
        >
          {isImage2 ? '✓ Image 2' : 'Make image 2'}
        </button>
      </div>
    </div>
  );
}
