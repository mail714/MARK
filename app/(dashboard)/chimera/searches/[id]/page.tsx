import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSearch } from '@/lib/chimera/searches';
import { listProspects } from '@/lib/chimera/prospects';
import { listBrands } from '@/lib/brands';
import { getAddressBooks } from '@/lib/email/address-books';
import { SearchProgress } from '@/components/chimera/SearchProgress';
import { ProspectsReview } from '@/components/chimera/ProspectsReview';

export const dynamic = 'force-dynamic';

export default async function ChimeraSearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const search = await getSearch(id);
  if (!search) notFound();

  const [{ items: prospects }, brands, books] = await Promise.all([
    listProspects({ searchId: id, limit: 500 }),
    listBrands(),
    getAddressBooks(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/chimera" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← All searches
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {search.category_label ?? search.category ?? 'Search'}
          {search.location ? <span className="ml-2 font-normal text-neutral-500">· {search.location}</span> : null}
        </h1>
        <p className="mt-1 text-xs text-neutral-500">
          Source: {search.source}
          {search.notes ? <> · {search.notes}</> : null}
        </p>
      </header>

      <SearchProgress initial={search} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Prospects ({prospects.length})
        </h2>
        <ProspectsReview
          prospects={prospects}
          brands={brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
          addressBooks={books.map((b) => ({
            dotdigital_id: b.dotdigital_id,
            name: b.name,
            contact_count: b.contact_count,
          }))}
        />
      </section>
    </div>
  );
}
