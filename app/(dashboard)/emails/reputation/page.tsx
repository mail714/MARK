import Link from 'next/link';
import { listBrands } from '@/lib/brands';
import {
  checkDomainHealth,
  getReputationSummaries,
  type DomainHealth,
} from '@/lib/email/reputation';
import { listFromAddresses } from '@/lib/dotdigital/from-addresses';
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
  const [summaries, brands, fromAddresses] = await Promise.all([
    getReputationSummaries(),
    listBrands(),
    listFromAddresses().catch(() => []),
  ]);
  const brandsById = new Map(brands.map((b) => [b.id, b]));

  // Pull the actual sending domains from dotdigital — those are what
  // mailbox providers judge for sender reputation. De-dupe across multiple
  // configured from-addresses so we don't pay for the same blacklist
  // lookup twice when (say) info@ and marketing@ are on the same domain.
  const sendingDomains = Array.from(
    new Set(
      fromAddresses
        .map((a) => {
          const at = a.email.indexOf('@');
          return at >= 0 ? a.email.slice(at + 1).toLowerCase() : null;
        })
        .filter((d): d is string => !!d),
    ),
  );

  const domainHealth = new Map<string, DomainHealth>();
  await Promise.all(
    sendingDomains.map(async (d) => {
      try {
        domainHealth.set(d, await checkDomainHealth(d));
      } catch {
        // Skip silently — the tile will show as 'not checked'
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

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Sending domain — blacklist status
        </h2>
        <p className="mt-1 text-xs text-neutral-600">
          Checked against your actual dotdigital from-addresses, not the brand websites.
          This is what mailbox providers grade.
        </p>
        {sendingDomains.length === 0 ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No from-addresses returned from dotdigital. Check the API credentials or set up
            a from-address in dotdigital admin.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {sendingDomains.map((d) => {
              const health = domainHealth.get(d);
              return (
                <div key={d} className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-sm text-neutral-800">{d}</span>
                    <span
                      className={`text-xs ${
                        !health
                          ? 'text-neutral-500'
                          : health.totalListings === 0
                            ? 'text-emerald-700'
                            : 'text-red-700'
                      }`}
                    >
                      {health
                        ? `${health.totalListings} listed / ${health.checks.length} checked`
                        : 'lookup failed'}
                    </span>
                  </div>
                  {health ? (
                    <ul className="mt-2 space-y-0.5 font-mono text-[10px]">
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
                          {c.listed ? '✗ LISTED on' : c.error ? '? couldn\'t check' : '✓ clean on'}{' '}
                          {c.list}
                          {c.error ? ` — ${c.error}` : ''}
                          {!c.error && c.result ? ` (${c.result})` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
            <p className="text-[10px] text-neutral-500">
              ⚠ Free DNS blacklists (Spamhaus DBL, SURBL, URIBL) refuse queries from cloud
              IPs — &quot;couldn&apos;t check&quot; lines mean lookup was blocked, not that you&apos;re listed.
              For an authoritative check use{' '}
              <a
                href="https://mxtoolbox.com/blacklists.aspx"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                MXToolbox
              </a>
              .
            </p>
          </div>
        )}
      </section>

      <div className="space-y-6">
        {summaries.map((s) => {
          const brand = brandsById.get(s.brand_id);
          const swatch = swatchForBrand(brand?.slug ?? null);
          const bTone = bounceTone(s.bounce_rate);
          const cTone = complaintTone(s.complaint_rate);
          const uTone = unsubscribeTone(s.unsubscribe_rate);

          return (
            <section
              key={s.brand_id}
              className={`rounded-lg border-l-4 ${swatch.border} border-y border-r border-neutral-200 bg-white p-5`}
            >
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">{s.brand_name}</h2>
                <div className="text-xs text-neutral-500">
                  {s.campaigns_90d} campaigns sent in last 90 days · {num(s.total_sent_90d)} emails
                </div>
              </header>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
              </div>

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
