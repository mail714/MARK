import Link from 'next/link';
import { listEmailImages } from '@/lib/email/images';
import { listBrands } from '@/lib/brands';
import { SyncImagesButton } from '@/components/email/SyncImagesButton';

export const dynamic = 'force-dynamic';

export default async function ImageLibraryPage() {
  const [images, brands] = await Promise.all([listEmailImages(), listBrands()]);
  const brandsById = new Map(brands.map((b) => [b.id, b.name]));

  // Group by sector for the gallery view.
  const sectors = new Map<string, typeof images>();
  for (const img of images) {
    const key = img.sector ?? 'Unsorted';
    const arr = sectors.get(key) ?? [];
    arr.push(img);
    sectors.set(key, arr);
  }
  const sortedSectors = Array.from(sectors.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <Link href="/emails" className="text-xs text-neutral-500 hover:text-neutral-700">
            ← Emails
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Image library</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Marketing-grade images for use in email campaigns. Sourced from Wix
            case studies; pickable by sector inside the campaign drafter.
          </p>
        </div>
        <SyncImagesButton />
      </header>

      {images.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
          No images synced yet. Click <strong>Sync from Honours Boards case studies</strong> to pull every published case-study photo (hero + detail) along with its sector tag and alt text.
        </div>
      ) : (
        <div className="space-y-8">
          {sortedSectors.map(([sector, items]) => (
            <section key={sector} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                {sector} <span className="font-normal text-neutral-400">({items.length})</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {items.map((img) => (
                  <div
                    key={img.id}
                    className="overflow-hidden rounded-md border border-neutral-200 bg-white"
                  >
                    <div className="relative aspect-[4/3] bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${img.url}/v1/fill/w_400,h_300,al_c,q_80/${encodeURIComponent('image.jpg')}`}
                        alt={img.alt_text ?? ''}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                    <div className="space-y-1 p-2 text-xs">
                      <div className="truncate font-medium text-neutral-800">
                        {img.customer_name ?? 'Untitled'}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-neutral-500">
                        <span>{img.brand_id ? brandsById.get(img.brand_id) ?? '' : ''}</span>
                        <span>{img.source_role === 'main' ? 'Hero' : img.source_role === 'image_2' ? 'Detail' : ''}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
