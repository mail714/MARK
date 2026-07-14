'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BulkJob } from '@/lib/chimera/bulk-jobs';

const KIND_LABEL: Record<string, string> = {
  'rescan-website': 'Rescanning websites',
  'deep-scan-website': 'Deep scanning websites (ScrapingBee)',
  'google-email-hunt': 'Hunting emails via Google',
  'apollo-enrich': 'Enriching with Apollo',
  'push-to-dotdigital': 'Pushing to dotdigital',
  'repair-websites': 'Repairing websites',
  'verify-emails': 'Verifying emails',
};

function elapsedSeconds(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

function fmtElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

// Polls a single bulk_job row every 1.5s while running. Renders a tile
// progress card with counters that tick up live, plus a timer. When the
// job lands, shows a final summary and triggers a router refresh so the
// parent page re-reads the updated prospects.
export function BulkJobProgress({
  jobId,
  onDone,
}: {
  jobId: string;
  onDone?: (job: BulkJob) => void;
}) {
  const router = useRouter();
  const [job, setJob] = useState<BulkJob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/chimera/jobs/${jobId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { job: BulkJob };
        if (cancelled) return;
        setJob(data.job);
        setElapsed(elapsedSeconds(data.job.started_at));
        if (data.job.status !== 'running' && !finishedRef.current) {
          finishedRef.current = true;
          onDone?.(data.job);
          router.refresh();
        }
      } catch {
        // swallow — next tick retries
      }
    };
    void tick();
    const handle = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [jobId, onDone, router]);

  if (!job) {
    return (
      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        Starting…
      </div>
    );
  }

  const pct = job.total > 0 ? Math.min(100, Math.round((job.processed / job.total) * 100)) : 0;
  const tone =
    job.status === 'completed'
      ? 'border-emerald-200 bg-emerald-50'
      : job.status === 'failed'
        ? 'border-red-200 bg-red-50'
        : 'border-blue-200 bg-blue-50';

  return (
    <div className={`space-y-2 rounded-md border ${tone} px-3 py-2.5 text-xs`}>
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-neutral-800">
          {KIND_LABEL[job.kind] ?? job.kind}{' '}
          <span className="text-neutral-500">
            {job.status === 'running' ? `· running ${fmtElapsed(elapsed)}` : `· ${job.status}`}
          </span>
        </div>
        <div className="text-neutral-600">
          {job.processed} / {job.total} ({pct}%)
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full transition-all ${
            job.status === 'failed'
              ? 'bg-red-500'
              : job.status === 'completed'
                ? 'bg-emerald-500'
                : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-3 text-neutral-700">
        <span>
          <strong className="text-neutral-900">{job.succeeded}</strong> succeeded
        </span>
        {job.emails_added > 0 ? (
          <span>
            <strong className="text-emerald-700">+{job.emails_added}</strong> emails
          </span>
        ) : null}
        {job.contacts_added > 0 ? (
          <span>
            <strong className="text-violet-700">+{job.contacts_added}</strong> contacts
          </span>
        ) : null}
        {job.failed > 0 ? (
          <span>
            <strong className="text-red-700">{job.failed}</strong> failed
          </span>
        ) : null}
      </div>
      {job.last_error && job.status !== 'running' ? (
        <div className="text-red-700">First error: {job.last_error}</div>
      ) : null}
    </div>
  );
}
