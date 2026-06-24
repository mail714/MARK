import Link from 'next/link';
import { CsvImportForm } from '@/components/chimera/CsvImportForm';
import { NewSearchForm } from '@/components/chimera/NewSearchForm';

export const dynamic = 'force-dynamic';

export default function NewChimeraSearchPage() {
  return (
    <div className="space-y-6">
      <header>
        <Link href="/chimera" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← All searches
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">New search</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Two ways to seed Chimera: a Google Maps grid scan over a location, or a CSV you already have.
          Both go through the same dedupe + review pipeline before anything reaches dotdigital.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Google Maps scan
        </h2>
        <NewSearchForm />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          CSV import
        </h2>
        <CsvImportForm />
      </section>
    </div>
  );
}
