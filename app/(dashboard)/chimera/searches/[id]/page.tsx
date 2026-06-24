import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSearch } from '@/lib/chimera/searches';
import { listProspects } from '@/lib/chimera/prospects';
import { listBrands } from '@/lib/brands';
import { getAddressBooks } from '@/lib/email/address-books';
import { DeleteSearchButton } from '@/components/chimera/DeleteSearchButton';
import { SaveSearchButton } from '@/components/chimera/SaveSearchButton';
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

  const brandsBare = brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }));
  const booksBare = books.map((b) => ({
    dotdigital_id: b.dotdigital_id,
    name: b.name,
    contact_count: b.contact_count,
  }));

  const defaultName = [search.category_label ?? search.category ?? 'Untitled', search.location]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/chimera" className="text-xs text-neutral-500 hover:text-neutral-700">
            ← All searches
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {search.category_label ?? search.category ?? 'Search'}
            {search.location ? <span className="ml-2 font-normal text-neutral-500">· {search.location}</span> : null}
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            Source: {search.source}
            {search.saved_search_id ? (
              <>
                {' '}·{' '}
                <Link href="/chimera/saved" className="underline">
                  From saved segment
                </Link>
              </>
            ) : null}
            {search.notes ? <> · {search.notes}</> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveSearchButton
            searchId={search.id}
            defaultName={defaultName}
            payload={(search.original_payload as Record<string, unknown> | null) ?? null}
            brands={brandsBare}
            addressBooks={booksBare}
          />
          <DeleteSearchButton
            searchId={search.id}
            label={search.category_label ?? search.category ?? search.location ?? 'Untitled'}
            redirectTo="/chimera"
            variant="button"
          />
        </div>
      </header>

      <SearchProgress initial={search} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Prospects ({prospects.length})
        </h2>
        <ProspectsReview prospects={prospects} brands={brandsBare} addressBooks={booksBare} />
      </section>
    </div>
  );
}
