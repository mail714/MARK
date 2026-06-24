import Link from 'next/link';
import { listProspects } from '@/lib/chimera/prospects';
import { listBrands } from '@/lib/brands';
import { getAddressBooks } from '@/lib/email/address-books';
import { ProspectsReview } from '@/components/chimera/ProspectsReview';

export const dynamic = 'force-dynamic';

export default async function AllProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const [{ items: prospects, total }, brands, books] = await Promise.all([
    listProspects({
      brandId: params.brand || undefined,
      status: (params.status as 'new' | 'approved' | 'pushed' | 'skipped' | 'unassigned' | undefined) || undefined,
      search: params.q,
      limit: 200,
    }),
    listBrands(),
    getAddressBooks(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/chimera" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Chimera
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">All prospects</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Every prospect across every search, deduplicated. Filter by brand assignment and status,
          search by name, domain or postcode.
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-xs">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Search</label>
          <input
            name="q"
            type="text"
            defaultValue={params.q ?? ''}
            placeholder="Name, domain, postcode…"
            className="mt-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Brand</label>
          <select name="brand" defaultValue={params.brand ?? ''} className="mt-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5">
            <option value="">— any —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-neutral-500">Status</label>
          <select name="status" defaultValue={params.status ?? ''} className="mt-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5">
            <option value="">— any —</option>
            <option value="unassigned">Unassigned</option>
            <option value="new">New</option>
            <option value="approved">Approved</option>
            <option value="pushed">Pushed</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700">
          Apply
        </button>
        <div className="ml-auto text-neutral-500">{total.toLocaleString('en-GB')} total</div>
      </form>

      <ProspectsReview
        prospects={prospects}
        brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
        addressBooks={books.map((b) => ({
          dotdigital_id: b.dotdigital_id,
          name: b.name,
          contact_count: b.contact_count,
        }))}
      />
    </div>
  );
}
