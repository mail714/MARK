import type { Check } from '@/lib/email/preflight';

const TONE: Record<string, { dot: string; ring: string; tag: string }> = {
  pass: {
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-200',
    tag: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  warn: {
    dot: 'bg-amber-500',
    ring: 'ring-amber-200',
    tag: 'bg-amber-50 text-amber-800 ring-amber-200',
  },
  fail: {
    dot: 'bg-red-500',
    ring: 'ring-red-200',
    tag: 'bg-red-50 text-red-700 ring-red-200',
  },
};

export function PreflightPanel({ checks }: { checks: Check[] }) {
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  const passes = checks.filter((c) => c.status === 'pass').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <Pill tone={TONE.pass.tag}>{passes} pass</Pill>
        {warns > 0 ? <Pill tone={TONE.warn.tag}>{warns} warn</Pill> : null}
        {fails > 0 ? <Pill tone={TONE.fail.tag}>{fails} fail</Pill> : null}
      </div>
      <ul className="space-y-1.5">
        {checks.map((c) => {
          const tone = TONE[c.status];
          return (
            <li
              key={c.id}
              className="flex items-start gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2"
            >
              <span className={`mt-1.5 inline-block h-2.5 w-2.5 rounded-full ${tone.dot}`} />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-neutral-800">{c.label}</div>
                  <div className="text-xs text-neutral-500">{c.message}</div>
                </div>
                {c.detail ? (
                  <div className="mt-1 text-[11px] text-neutral-500">{c.detail}</div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone}`}>
      {children}
    </span>
  );
}
