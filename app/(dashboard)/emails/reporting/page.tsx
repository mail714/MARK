import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function ReportingPage() {
  return (
    <div className="space-y-6">
      <header>
        <Link href="/emails" className="text-xs text-neutral-500 hover:text-neutral-700">
          ← Emails
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Reporting</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Per-campaign opens, clicks, unsubscribes and bounces pulled from
          dotdigital with sector and brand breakdowns.
        </p>
      </header>
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-12 text-center text-sm text-neutral-500">
        Coming in Phase D — once a few campaigns have been pushed and sent, MARK
        will pull stats per send and render trend lines per brand and per sector.
        After a few sends per sector the optimisation suggestions kick in.
      </div>
    </div>
  );
}
