import Link from 'next/link';
import { getSchoolsSyncStatus } from '@/lib/gov-uk-schools/sync';
import { SchoolsSyncCard } from '@/components/chimera/SchoolsSyncCard';

export const dynamic = 'force-dynamic';

export default async function ChimeraSourcesPage() {
  const schools = await getSchoolsSyncStatus();
  return (
    <div className="space-y-6">
      <header>
        <Link href="/chimera" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Chimera
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Data sources</h1>
        <p className="mt-1 text-sm text-neutral-600">
          External data sources Chimera draws on. Each is independent — fail to sync one
          and the others keep working.
        </p>
      </header>

      <SchoolsSyncCard initial={schools} />

      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-5 text-sm text-neutral-500">
        <h3 className="text-sm font-medium text-neutral-700">Other sources</h3>
        <ul className="mt-2 space-y-1 text-xs">
          <li>
            <strong>Google Places</strong> — keyed via <code className="rounded bg-neutral-100 px-1">GOOGLE_MAPS_API_KEY</code>{' '}
            in env. Used for grid searches and estate sweeps. No sync — queried live.
          </li>
          <li>
            <strong>Companies House</strong> — keyed via{' '}
            <code className="rounded bg-neutral-100 px-1">COMPANIES_HOUSE_API_KEY</code> in env. Used as an
            optional enrichment step on estate sweeps. No sync — queried live.
          </li>
        </ul>
      </div>
    </div>
  );
}
