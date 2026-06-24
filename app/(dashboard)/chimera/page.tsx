import Link from 'next/link';
import { listSearches } from '@/lib/chimera/searches';
import { DeleteSearchButton } from '@/components/chimera/DeleteSearchButton';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
  running: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function ChimeraPage() {
  const searches = await listSearches();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chimera</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Prospect discovery for the marketing team. Searches scrape contact details from
            Google Maps + websites; CSV imports take a list you already have. Approved prospects
            push into dotdigital address books.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/chimera/sources"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Sources
          </Link>
          <Link
            href="/chimera/saved"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Saved segments
          </Link>
          <Link
            href="/chimera/prospects"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            All prospects
          </Link>
          <Link
            href="/chimera/suppressions"
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Suppressions
          </Link>
          <Link
            href="/chimera/searches/new"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
          >
            New search →
          </Link>
        </div>
      </header>

      {searches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
          No searches yet. Hit{' '}
          <Link href="/chimera/searches/new" className="underline">
            New search
          </Link>{' '}
          to scrape your first list.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-3 py-2">Search</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Found</th>
                <th className="px-3 py-2 text-right">With email</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {searches.map((s) => (
                <tr key={s.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/chimera/searches/${s.id}`}
                      className="block max-w-md truncate text-neutral-800 hover:underline"
                    >
                      <span className="font-medium">{s.category_label ?? s.category ?? 'Untitled'}</span>
                      {s.location ? (
                        <span className="text-neutral-500"> · {s.location}</span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600">{s.source}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${STATUS_TONE[s.status] ?? STATUS_TONE.pending}`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-neutral-700">
                    {s.prospects_found.toLocaleString('en-GB')}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-neutral-700">
                    {s.prospects_with_email.toLocaleString('en-GB')}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600">{fmtDate(s.started_at ?? s.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <DeleteSearchButton
                      searchId={s.id}
                      label={s.category_label ?? s.category ?? s.location ?? 'Untitled'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
