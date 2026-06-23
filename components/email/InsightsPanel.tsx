import type { BrandInsights, CampaignInsight } from '@/lib/email/insights';

function pct(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export function InsightsPanel({ insights }: { insights: BrandInsights | null }) {
  if (!insights || insights.campaignsCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-5 text-sm text-neutral-500">
        No past performance data yet for this brand{insights?.sector ? ` and sector "${insights.sector}"` : ''}.
        The drafter will lean on brand voice rules and the brief alone. Once a few campaigns
        have sent and you&apos;ve refreshed their stats, this panel populates and the next draft
        learns from what worked.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Avg open" value={pct(insights.avgOpenRate)} />
        <Tile label="Avg click" value={pct(insights.avgClickRate)} />
        <Tile label="Avg unsub" value={pct(insights.avgUnsubscribeRate)} />
      </div>
      <p className="text-[10px] text-neutral-500">
        Averaged over {insights.campaignsCount} sent campaign{insights.campaignsCount === 1 ? '' : 's'}
        {insights.sector ? ` for sector "${insights.sector}"` : ' across all sectors'}.
      </p>

      {insights.top.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-emerald-700">
            Top performers
          </h3>
          <ul className="mt-1 space-y-1">
            {insights.top.map((c) => (
              <PerformanceRow key={`top-${c.campaign_id}`} c={c} />
            ))}
          </ul>
        </div>
      ) : null}

      {insights.bottom.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-red-700">
            Underperformers
          </h3>
          <ul className="mt-1 space-y-1">
            {insights.bottom.map((c) => (
              <PerformanceRow key={`bot-${c.campaign_id}`} c={c} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">{value}</div>
    </div>
  );
}

function PerformanceRow({ c }: { c: CampaignInsight }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-xs">
      <span className="truncate text-neutral-700">
        {c.subject ?? c.internal_name ?? '(untitled)'}
      </span>
      <span className="shrink-0 text-neutral-500">
        open <span className="font-medium text-neutral-800">{pct(c.open_rate)}</span> · click{' '}
        <span className="font-medium text-neutral-800">{pct(c.click_rate)}</span>
      </span>
    </li>
  );
}
