'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Image = {
  id: string;
  url: string;
  alt_text: string | null;
  sector: string | null;
  customer_name: string | null;
  source_role: string | null;
};

type Props = {
  campaignId: string;
  selectedUrl: string | null;
  selectedAlt: string | null;
  defaultSector: string | null;
};

function thumbnail(url: string): string {
  // Use Wix's image-fill service for nice consistent thumbnails.
  return `${url}/v1/fill/w_400,h_300,al_c,q_80/image.jpg`;
}

export function HeroImagePicker({ campaignId, selectedUrl, selectedAlt, defaultSector }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [images, setImages] = useState<Image[] | null>(null);
  const [sectorFilter, setSectorFilter] = useState(defaultSector ?? '');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sectorFilter) params.set('sector', sectorFilter);
      const res = await fetch(`/api/emails/images?${params.toString()}`);
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = await res.json();
      setImages(data.images as Image[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (images !== null) {
      void load();
    }
    // Only re-fetch when sectorFilter changes after the first open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorFilter]);

  function open() {
    setError(null);
    dialogRef.current?.showModal();
    if (images === null) void load();
  }
  function close() {
    if (saving) return;
    dialogRef.current?.close();
  }

  async function choose(img: Image) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/emails/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hero_image_url: img.url,
          hero_image_alt: img.alt_text,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      dialogRef.current?.close();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/emails/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hero_image_url: null, hero_image_alt: null }),
      });
      if (!res.ok) throw new Error(`Clear failed (${res.status})`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const sectors = images
    ? Array.from(new Set(images.map((i) => i.sector).filter(Boolean) as string[])).sort()
    : [];

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">
        Hero image
      </label>
      <div className="flex items-start gap-3">
        <div className="w-48 shrink-0">
          {selectedUrl ? (
            <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
              <div className="relative aspect-[4/3] bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbnail(selectedUrl)}
                  alt={selectedAlt ?? ''}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            </div>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white text-xs text-neutral-400">
              No image selected
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          {selectedAlt ? (
            <div className="text-xs text-neutral-600">{selectedAlt}</div>
          ) : (
            <div className="text-xs text-neutral-400">
              {selectedUrl ? 'No alt text on this image' : 'Pick one from the library — the AI drafter will use the URL and the alt text in the email body.'}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={open}
              disabled={saving}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              {selectedUrl ? 'Change image' : 'Choose image'}
            </button>
            {selectedUrl ? (
              <button
                type="button"
                onClick={clear}
                disabled={saving}
                className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
              >
                Clear
              </button>
            ) : null}
          </div>
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        className="w-full max-w-4xl rounded-lg border border-neutral-200 p-0 shadow-xl backdrop:bg-neutral-900/40"
      >
        <div className="space-y-4 p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Pick an image</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Click an image to set it as the hero. URL and alt text get passed
                to the AI drafter and rendered in the email.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-500">Sector</label>
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
              >
                <option value="">All</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-sm text-neutral-500">Loading…</div>
            ) : !images || images.length === 0 ? (
              <div className="rounded border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
                No images. Sync the library first on the <strong>Image library</strong> page.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => choose(img)}
                    disabled={saving}
                    className="overflow-hidden rounded-md border border-neutral-200 bg-white text-left hover:border-neutral-500 hover:shadow"
                  >
                    <div className="relative aspect-[4/3] bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnail(img.url)}
                        alt={img.alt_text ?? ''}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                    <div className="space-y-0.5 p-2 text-xs">
                      <div className="truncate font-medium text-neutral-800">
                        {img.customer_name ?? '—'}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-neutral-500">
                        <span>{img.sector ?? ''}</span>
                        <span>{img.source_role === 'main' ? 'Hero' : img.source_role === 'image_2' ? 'Detail' : ''}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Close
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
