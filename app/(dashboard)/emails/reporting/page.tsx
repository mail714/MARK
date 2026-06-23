import Link from 'next/link';
import { listBrands } from '@/lib/brands';
import { deriveRates, listCampaignsWithStats } from '@/lib/email/stats';
import { swatchForBrand } from '@/lib/email/brand-colours';

export const dynamic = 'force-dynamic';

function pct(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-GB');
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function ReportingPage() {
  const [campaigns, brands] = await Promise.all([listCampaignsWithStats(), listBrands()]);
  const brandsById = new Map(brands.map((b) => [b.id, b]));

  const sent = campaigns.filter((c) => c.stats?.date_sent);
  const noStats = campaigns.filter((c) => !c.stats?.date_sent);

  // Brand-level aggregates — average open/click rate over campaigns that have
  // actually sent. Simple unweighted average is fine until we have enough
  // volume to weight by recipients.
  type Agg = { brandId: string; campaigns: number; openRate: number | null; clickRate: number | null };
  const aggByBrand = new Map<string, { count: number; openSum: number; openN: number; clickSum: number; clickN: number }>();
  for (const c of sent) {
    if (!c.brand_id || !c.stats) continue;
    const r = deriveRates(c.stats);
    const agg = aggByBrand.get(c.brand_id) ?? { count: 0, openSum: 0, openN: 0, clickSum: 0, clickN: 0 };
    agg.count += 1;
    if (r.openRate !== null) {
      agg.openSum += r.openRate;
      agg.openN += 1;
    }
    if (r.clickRate !== null) {
      agg.clickSum += r.clickRate;
      agg.clickN += 1;
    }
    aggByBrand.set(c.brand_id, agg);
  }
  const brandAggs: Agg[] = Array.from(aggByBrand.entries()).map(([brandId, a]) => ({
    brandId,
    campaigns: a.count,
    openRate: a.openN > 0 ? a.openSum / a.openN : null,
    clickRate: a.clickN > 0 ? a.clickSum / a.clickN : null,
  }));

  return (
    <div className="space-y-8">
      <header>
        <Link href="/emails" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Emails
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reporting</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Per-campaign opens, clicks, unsubscribes and bounces pulled from dotdigital.
          {sent.length === 0
            ? ' Numbers will populate once a few campaigns have actually sent.'
            : ` ${sent.length} campaign${sent.length === 1 ? '' : 's'} with data.`}
        </p>
      </header>

      {brandAggs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            By brand
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {brandAggs.map((a) => {
              const brand = brandsById.get(a.brandId);
              const swatch = swatchForBrand(brand?.slug ?? null);
              return (
                <div key={a.brandId} className={`rounded-lg border-l-4 ${swatch.border} border-y border-r border-neutral-200 bg-white p-4`}>
                  <div className="text-xs uppercase tracking-wider text-neutral-500">
                    {brand?.name ?? 'Unknown brand'}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <Stat label="Avg open" value={pct(a.openRate)} />
                    <Stat label="Avg click" value={pct(a.clickRate)} />
                  </div>
                  <div className="mt-2 text-[10px] text-neutral-500">
                    {a.campaigns} campaign{a.campaigns === 1 ? '' : 's'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Campaigns
        </h2>
        {campaigns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
            No campaigns pushed to dotdigital yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Campaign</th>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2 text-right">Recipients</th>
                  <th className="px-3 py-2 text-right">Open</th>
                  <th className="px-3 py-2 text-right">Click</th>
                  <th className="px-3 py-2 text-right">Unsub</th>
                  <th className="px-3 py-2 text-right">Bounce</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const brand = c.brand_id ? brandsById.get(c.brand_id) : null;
                  const swatch = swatchForBrand(brand?.slug ?? null);
                  const r = c.stats ? deriveRates(c.stats) : null;
                  return (
                    <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                      <td className="px-3 py-2">
                        <Link
                          href={`/emails/campaigns/${c.id}`}
                          className="block max-w-xs truncate font-medium text-neutral-800 hover:underline"
                        >
                          {c.internal_name ?? c.subject ?? '(untitled)'}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {brand ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${swatch.badge} ${swatch.badgeText}`}>
                            {brand.name}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">{c.sector ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-neutral-600">{fmtDate(c.stats?.date_sent ?? c.pushed_at)}</td>
                      <td className="px-3 py-2 text-right text-xs text-neutral-600">{num(c.stats?.num_total_recipients ?? c.stats?.num_total_sent ?? null)}</td>
                      <td className="px-3 py-2 text-right text-xs text-neutral-800">{r ? pct(r.openRate) : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs text-neutral-800">{r ? pct(r.clickRate) : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs text-neutral-600">{num(c.stats?.num_unsubscribes ?? null)}</td>
                      <td className="px-3 py-2 text-right text-xs text-neutral-600">{r ? pct(r.bounceRate) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {noStats.length > 0 && sent.length > 0 ? (
          <p className="text-xs text-neutral-500">
            {noStats.length} campaign{noStats.length === 1 ? '' : 's'} pushed but not yet sent — open one
            and hit <strong>Refresh stats</strong> after dotdigital&apos;s actually sent them.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight text-neutral-900">{value}</div>
    </div>
  );
}
