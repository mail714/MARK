import Link from 'next/link';
import { getAddressBooks } from '@/lib/email/address-books';
import { listBrands } from '@/lib/brands';
import { SyncAddressBooksButton } from '@/components/email/SyncAddressBooksButton';
import { AddressBookTagInputs } from '@/components/email/AddressBookTagInputs';

export const dynamic = 'force-dynamic';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function AddressBooksPage() {
  let books: Awaited<ReturnType<typeof getAddressBooks>> = [];
  let brands: Awaited<ReturnType<typeof listBrands>> = [];
  let error: string | null = null;
  try {
    [books, brands] = await Promise.all([getAddressBooks(), listBrands()]);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const brandsBare = brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <Link href="/emails" className="text-xs text-neutral-500 hover:text-neutral-700">
            ← Emails
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Address books</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Synced from dotdigital. Tag each with a brand and a sector so the
            drafter can target tone and content appropriately.
          </p>
        </div>
        <SyncAddressBooksButton />
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-medium">Could not load address books</div>
          <div className="mt-1 font-mono text-xs">{error}</div>
        </div>
      ) : null}

      {books.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
          No address books synced yet. Click <strong>Sync from dotdigital</strong> to pull them in.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full">
            <thead className="bg-neutral-50 text-left">
              <tr>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Name</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Contacts</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Visibility</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Brand</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Sector</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Last synced</th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.id} className="border-t border-neutral-200 hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm font-medium text-neutral-900">{b.name}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{b.contact_count ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-500">{b.visibility ?? '—'}</td>
                  <AddressBookTagInputs
                    addressBookId={b.id}
                    brands={brandsBare}
                    initialBrandId={b.brand_id}
                    initialSector={b.sector}
                  />
                  <td className="px-4 py-3 text-sm text-neutral-500">{fmtDate(b.last_synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
