import { deriveRates, type CampaignStats } from '@/lib/email/stats';

function pct(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function num(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-GB');
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CampaignStatsPanel({ stats }: { stats: CampaignStats | null }) {
  if (!stats) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-500">
        No stats pulled yet. Once the campaign has sent from dotdigital, hit
        <strong> Refresh stats</strong> to pull opens, clicks, bounces and unsubscribes back.
      </div>
    );
  }

  const r = deriveRates(stats);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Sent" value={num(stats.num_total_sent)} sub={`${num(stats.num_total_recipients)} recipients`} />
        <Tile label="Open rate" value={pct(r.openRate)} sub={`${num(stats.num_unique_opens)} unique`} highlight="emerald" />
        <Tile label="Click rate" value={pct(r.clickRate)} sub={`${num(stats.num_unique_clicks)} unique`} highlight="emerald" />
        <Tile label="Click-to-open" value={pct(r.clickToOpenRate)} sub="of openers clicked" />
        <Tile label="Bounce rate" value={pct(r.bounceRate)} sub={`${num((stats.num_hard_bounces ?? 0) + (stats.num_soft_bounces ?? 0))} bounces`} highlight="amber" />
        <Tile label="Unsubscribes" value={num(stats.num_unsubscribes)} sub={pct(r.unsubscribeRate)} />
        <Tile label="Spam complaints" value={num(stats.num_spam_complaints)} sub={stats.num_spam_complaints && stats.num_spam_complaints > 0 ? 'check copy' : 'clean'} highlight={stats.num_spam_complaints && stats.num_spam_complaints > 0 ? 'red' : undefined} />
        <Tile label="Forwards / replies" value={`${num(stats.num_forwards)} / ${num(stats.num_replies)}`} sub="engagement signals" />
      </div>
      <div className="text-[10px] text-neutral-400">
        Sent {fmtDate(stats.date_sent)} · last synced {fmtDate(stats.last_synced_at)}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: 'emerald' | 'amber' | 'red';
}) {
  const tone =
    highlight === 'emerald'
      ? 'border-emerald-200 bg-emerald-50'
      : highlight === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : highlight === 'red'
          ? 'border-red-200 bg-red-50'
          : 'border-neutral-200 bg-white';
  return (
    <div className={`rounded-lg border ${tone} p-3`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10px] text-neutral-500">{sub}</div> : null}
    </div>
  );
}
