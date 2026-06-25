import Link from 'next/link';
import { listBrands } from '@/lib/brands';
import {
  checkDomainHealth,
  getReputationSummaries,
  sendingDomainForBrand,
  type DomainHealth,
} from '@/lib/email/reputation';
import { swatchForBrand } from '@/lib/email/brand-colours';

export const dynamic = 'force-dynamic';

function pct(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-GB');
}

function bounceTone(rate: number | null): 'green' | 'amber' | 'red' | 'neutral' {
  if (rate === null) return 'neutral';
  if (rate < 0.02) return 'green';
  if (rate < 0.05) return 'amber';
  return 'red';
}

function complaintTone(rate: number | null): 'green' | 'amber' | 'red' | 'neutral' {
  if (rate === null) return 'neutral';
  if (rate < 0.001) return 'green';
  if (rate < 0.003) return 'amber';
  return 'red';
}

function unsubscribeTone(rate: number | null): 'green' | 'amber' | 'red' | 'neutral' {
  if (rate === null) return 'neutral';
  if (rate < 0.005) return 'green';
  if (rate < 0.01) return 'amber';
  return 'red';
}

function toneClass(t: 'green' | 'amber' | 'red' | 'neutral'): string {
  return t === 'green'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : t === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : t === 'red'
        ? 'border-red-200 bg-red-50 text-red-900'
        : 'border-neutral-200 bg-neutral-50 text-neutral-700';
}

export default async function ReputationPage() {
  const [summaries, brands] = await Promise.all([getReputationSummaries(), listBrands()]);
  const brandsById = new Map(brands.map((b) => [b.id, b]));

  // Domain health check is per-brand and runs in parallel — a few DNS
  // resolves each, ~100ms total per brand.
  const domainChecks = new Map<string, DomainHealth | null>();
  await Promise.all(
    summaries.map(async (s) => {
      const brand = brandsById.get(s.brand_id);
      const domain = sendingDomainForBrand(brand?.website_url ?? null);
      if (!domain) {
        domainChecks.set(s.brand_id, null);
        return;
      }
      try {
        const health = await checkDomainHealth(domain);
        domainChecks.set(s.brand_id, health);
      } catch {
        domainChecks.set(s.brand_id, null);
      }
    }),
  );

  return (
    <div className="space-y-8">
      <header>
        <Link href="/emails" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Emails
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sender reputation</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Per-brand health snapshot pulled from the last 90 days of pushed campaigns plus a
          live domain blacklist check. Industry-healthy thresholds: bounce &lt; 2%, complaint
          &lt; 0.1%, unsubscribe &lt; 0.5%. Mailbox providers use these as proxies for whether
          to deliver you to inbox or spam.
        </p>
      </header>

      <ExternalToolsCard />

      <div className="space-y-6">
        {summaries.map((s) => {
          const brand = brandsById.get(s.brand_id);
          const swatch = swatchForBrand(brand?.slug ?? null);
          const health = domainChecks.get(s.brand_id);
          const bTone = bounceTone(s.bounce_rate);
          const cTone = complaintTone(s.complaint_rate);
          const uTone = unsubscribeTone(s.unsubscribe_rate);
          const blacklistTone =
            !health
              ? 'neutral'
              : health.totalListings === 0
                ? 'green'
                : health.totalListings === 1
                  ? 'amber'
                  : 'red';

          return (
            <section
              key={s.brand_id}
              className={`rounded-lg border-l-4 ${swatch.border} border-y border-r border-neutral-200 bg-white p-5`}
            >
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{s.brand_name}</h2>
                  {health?.domain ? (
                    <span className="font-mono text-xs text-neutral-500">{health.domain}</span>
                  ) : null}
                </div>
                <div className="text-xs text-neutral-500">
                  {s.campaigns_90d} campaigns sent in last 90 days · {num(s.total_sent_90d)} emails
                </div>
              </header>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <Tile
                  label="Bounce rate"
                  value={pct(s.bounce_rate)}
                  sub="target: <2%"
                  tone={bTone}
                />
                <Tile
                  label="Complaint rate"
                  value={pct(s.complaint_rate)}
                  sub="target: <0.1%"
                  tone={cTone}
                />
                <Tile
                  label="Unsubscribe rate"
                  value={pct(s.unsubscribe_rate)}
                  sub="target: <0.5%"
                  tone={uTone}
                />
                <Tile
                  label="Blacklists"
                  value={health ? `${health.totalListings} / ${health.checks.length}` : '—'}
                  sub={health ? 'DBLs checked' : 'no domain'}
                  tone={blacklistTone}
                />
              </div>

              {health && health.checks.length > 0 ? (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-neutral-500 hover:text-neutral-700">
                    Domain blacklist detail
                  </summary>
                  <ul className="mt-1 space-y-0.5 font-mono text-[10px]">
                    {health.checks.map((c) => (
                      <li
                        key={c.list}
                        className={
                          c.listed
                            ? 'text-red-700'
                            : c.error
                              ? 'text-neutral-400'
                              : 'text-emerald-700'
                        }
                      >
                        {c.listed ? '✗ LISTED on' : c.error ? '? unable to check' : '✓ clean on'}{' '}
                        {c.list}
                        {c.result ? ` (${c.result})` : ''}
                        {c.error ? ` (${c.error})` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {s.worst_campaign && s.worst_campaign.bounce_rate > 0.02 ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Worst recent campaign:{' '}
                  <Link href={`/emails/campaigns/${s.worst_campaign.id}`} className="underline">
                    {s.worst_campaign.subject ?? '(untitled)'}
                  </Link>{' '}
                  — {pct(s.worst_campaign.bounce_rate)} bounce rate over{' '}
                  {num(s.worst_campaign.sent)} sends. Investigate this one specifically.
                </div>
              ) : null}

              {s.campaigns_90d === 0 ? (
                <p className="mt-3 text-xs text-neutral-500">
                  No campaigns sent for this brand in the last 90 days. Reputation can&apos;t be
                  measured from MARK&apos;s data alone until you push and refresh stats.
                </p>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: 'green' | 'amber' | 'red' | 'neutral';
}) {
  return (
    <div className={`rounded-md border p-3 ${toneClass(tone)}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[10px] opacity-75">{sub}</div>
    </div>
  );
}

function ExternalToolsCard() {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-700">Cross-check with external tools</h2>
      <p className="mt-1 text-xs text-neutral-600">
        MARK&apos;s view is based on dotdigital&apos;s campaign reports plus a live DNS blacklist
        check. For mailbox-provider-specific signals (Gmail, Outlook) use these free tools:
      </p>
      <ul className="mt-2 space-y-1 text-xs text-neutral-700">
        <li>
          <a
            href="https://postmaster.google.com/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Google Postmaster Tools
          </a>{' '}
          — official Gmail data. Domain reputation, spam rate, authentication. One-time DNS
          verification.
        </li>
        <li>
          <a
            href="https://mxtoolbox.com/blacklists.aspx"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            MXToolbox
          </a>{' '}
          — instant check against ~100 blacklists.
        </li>
        <li>
          <a
            href="https://www.mail-tester.com/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Mail-Tester
          </a>{' '}
          — send a real campaign to their address, get a 0-10 score covering content,
          authentication and reputation.
        </li>
        <li>
          <a
            href="https://www.senderscore.org/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Sender Score
          </a>{' '}
          — 0-100 IP reputation grade from Validity.
        </li>
      </ul>
    </div>
  );
}
