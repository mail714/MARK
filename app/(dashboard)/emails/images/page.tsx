import Link from 'next/link';
import { listAllImageSectors, listEmailImages } from '@/lib/email/images';
import { listBrands } from '@/lib/brands';
import { SyncImagesButton } from '@/components/email/SyncImagesButton';

export const dynamic = 'force-dynamic';

function buildHref(
  search: string,
  brandId: string,
  sector: string,
  page: number,
): string {
  const sp = new URLSearchParams();
  if (search) sp.set('q', search);
  if (brandId) sp.set('brand_id', brandId);
  if (sector) sp.set('sector', sector);
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `/emails/images?${qs}` : '/emails/images';
}

export default async function ImageLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; brand_id?: string; sector?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = (params.q ?? '').trim();
  const brandId = params.brand_id ?? '';
  const sector = params.sector ?? '';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const [result, brands, sectors] = await Promise.all([
    listEmailImages({
      brandId: brandId || null,
      sector: sector || null,
      search: search || null,
      page,
      pageSize: 60,
    }),
    listBrands(),
    listAllImageSectors({ brandId: brandId || null }),
  ]);
  const brandsById = new Map(brands.map((b) => [b.id, b.name]));
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const showingFrom = result.items.length === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const showingTo = (result.page - 1) * result.pageSize + result.items.length;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <Link href="/emails" className="text-xs text-neutral-500 hover:text-neutral-700">
            ← Emails
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Image library</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Marketing-grade images for hero shots in campaigns. Sourced from the
            three Wix brand sites.
          </p>
        </div>
        <SyncImagesButton />
      </header>

      <form action="/emails/images" method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">Search</label>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="alt text, description, customer"
            className="mt-1 w-64 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">Brand</label>
          <select
            name="brand_id"
            defaultValue={brandId}
            className="mt-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500">Sector</label>
          <select
            name="sector"
            defaultValue={sector}
            className="mt-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
        >
          Apply
        </button>
        {search || brandId || sector ? (
          <Link href="/emails/images" className="self-end text-xs text-neutral-500 hover:text-neutral-700">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="text-xs text-neutral-500">
        Showing {showingFrom}-{showingTo} of {result.total}
      </div>

      {result.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
          {search || brandId || sector ? (
            <>No images match the current filter.</>
          ) : (
            <>No images synced yet. Use the buttons above to sync from a Wix site.</>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {result.items.map((img) => (
            <div key={img.id} className="overflow-hidden rounded-md border border-neutral-200 bg-white">
              <div className="relative aspect-[4/3] bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${img.url}/v1/fill/w_400,h_300,al_c,q_80/image.jpg`}
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
                  <span>{img.sector ?? ''}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-end gap-1 pt-2 text-xs">
          {page > 1 ? (
            <Link href={buildHref(search, brandId, sector, page - 1)} className="rounded border border-neutral-200 bg-white px-2 py-1 hover:border-neutral-400">← Prev</Link>
          ) : (
            <span className="rounded border border-neutral-100 bg-neutral-50 px-2 py-1 text-neutral-300">← Prev</span>
          )}
          <span className="px-2 text-neutral-500">Page {page} of {totalPages}</span>
          {page < totalPages ? (
            <Link href={buildHref(search, brandId, sector, page + 1)} className="rounded border border-neutral-200 bg-white px-2 py-1 hover:border-neutral-400">Next →</Link>
          ) : (
            <span className="rounded border border-neutral-100 bg-neutral-50 px-2 py-1 text-neutral-300">Next →</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
