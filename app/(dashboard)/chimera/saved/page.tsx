import Link from 'next/link';
import { listSavedSearches } from '@/lib/chimera/saved';
import { listBrands } from '@/lib/brands';
import { getAddressBooks } from '@/lib/email/address-books';
import { SavedSearchesList } from '@/components/chimera/SavedSearchesList';

export const dynamic = 'force-dynamic';

export default async function ChimeraSavedPage() {
  const [items, brands, books] = await Promise.all([
    listSavedSearches(),
    listBrands(),
    getAddressBooks(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/chimera" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Chimera
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Saved segments</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Reusable search criteria. Re-run any segment to pull the latest matches against the
          current data sources. Bind a dotdigital book to a segment and the &quot;Sync to book&quot;
          action additively pushes new prospects there — existing contacts stay put.
        </p>
      </header>

      <SavedSearchesList
        initial={items}
        brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
        addressBooks={books.map((b) => ({ dotdigital_id: b.dotdigital_id, name: b.name }))}
      />
    </div>
  );
}
