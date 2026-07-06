import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSearch } from '@/lib/chimera/searches';
import { recountSearchCounters } from '@/lib/chimera/recount';
import { listProspects } from '@/lib/chimera/prospects';
import { listBrands } from '@/lib/brands';
import { getAddressBooks } from '@/lib/email/address-books';
import { DeleteSearchButton } from '@/components/chimera/DeleteSearchButton';
import { RerunSearchButton } from '@/components/chimera/RerunSearchButton';
import { SaveSearchButton } from '@/components/chimera/SaveSearchButton';
import { SearchProgress } from '@/components/chimera/SearchProgress';
import { ProspectsReview } from '@/components/chimera/ProspectsReview';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 500;

export default async function ChimeraSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
  const search = await getSearch(id);
  if (!search) notFound();

  const isLive = search.status === 'pending' || search.status === 'running';
  const [counters, { items: prospects, total: prospectTotal }, brands, books] = await Promise.all([
    // Recompute the header tiles from the linked prospects on every view —
    // the counters written during the run only reflect what that run
    // scraped, so rescans/repairs/dedupe leave them stale. Skip while the
    // search is still running (the run's own live counters are fresher).
    isLive ? Promise.resolve(null) : recountSearchCounters(id),
    listProspects({ searchId: id, limit: PAGE_SIZE, offset: (pageNum - 1) * PAGE_SIZE }),
    listBrands(),
    getAddressBooks(),
  ]);
  if (counters) {
    search.prospects_found = counters.found;
    search.prospects_with_email = counters.withEmail;
    search.prospects_with_website = counters.withWebsite;
  }

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
          <RerunSearchButton
            searchId={search.id}
            currentMaxResults={search.max_results}
            hasPayload={!!search.original_payload}
          />
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Prospects ({prospectTotal.toLocaleString('en-GB')})
          </h2>
          {prospectTotal > PAGE_SIZE ? (
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <span>
                Showing {((pageNum - 1) * PAGE_SIZE + 1).toLocaleString('en-GB')}–
                {Math.min(pageNum * PAGE_SIZE, prospectTotal).toLocaleString('en-GB')} of{' '}
                {prospectTotal.toLocaleString('en-GB')}
              </span>
              {pageNum > 1 ? (
                <Link
                  href={`/chimera/searches/${id}?page=${pageNum - 1}`}
                  className="rounded border border-neutral-200 bg-white px-2 py-1 hover:border-neutral-400"
                >
                  ← Prev 500
                </Link>
              ) : null}
              {pageNum * PAGE_SIZE < prospectTotal ? (
                <Link
                  href={`/chimera/searches/${id}?page=${pageNum + 1}`}
                  className="rounded border border-neutral-200 bg-white px-2 py-1 hover:border-neutral-400"
                >
                  Next 500 →
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        <ProspectsReview
          prospects={prospects}
          brands={brandsBare}
          addressBooks={booksBare}
          searchTotal={prospectTotal}
          searchId={search.id}
          searchWithEmail={search.prospects_with_email}
        />
      </section>
    </div>
  );
}
