import Link from 'next/link';
import { listCampaigns } from '@/lib/email/campaigns';
import { listBrands } from '@/lib/brands';
import { NewCampaignButton } from '@/components/email/NewCampaignButton';

export const dynamic = 'force-dynamic';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  approved: { label: 'Approved', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  pushed: { label: 'Pushed', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  failed: { label: 'Failed', tone: 'bg-red-50 text-red-700 ring-red-200' },
};

export default async function CampaignsPage() {
  let campaigns: Awaited<ReturnType<typeof listCampaigns>> = [];
  let brands: Awaited<ReturnType<typeof listBrands>> = [];
  let error: string | null = null;
  try {
    [campaigns, brands] = await Promise.all([listCampaigns(), listBrands()]);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const brandsBare = brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }));
  const brandsById = new Map(brands.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <Link href="/emails" className="text-xs text-neutral-500 hover:text-neutral-700">
            ← Emails
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Drafts authored in MARK. Approved drafts get pushed to dotdigital.
          </p>
        </div>
        <NewCampaignButton brands={brandsBare} />
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-medium">Could not load campaigns</div>
          <div className="mt-1 font-mono text-xs">{error}</div>
        </div>
      ) : null}

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
          No campaigns yet. Click <strong>New campaign</strong> to start one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full">
            <thead className="bg-neutral-50 text-left">
              <tr>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Campaign</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Brand</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Sector</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Status</th>
                <th className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-neutral-500">Updated</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const meta = STATUS_LABEL[c.status] ?? STATUS_LABEL.draft;
                return (
                  <tr key={c.id} className="border-t border-neutral-200 hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                      <Link href={`/emails/campaigns/${c.id}`} className="hover:underline">
                        {c.internal_name ?? c.subject ?? '(untitled)'}
                      </Link>
                      {c.subject ? (
                        <div className="mt-0.5 text-xs text-neutral-500">{c.subject}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">
                      {c.brand_id ? brandsById.get(c.brand_id) ?? '—' : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{c.sector ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${meta.tone}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{fmtDate(c.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
