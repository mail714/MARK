import Link from 'next/link';

export default function OverviewPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Multi-brand marketing dashboard. Case Study Producer is the first module.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/case-studies"
          className="block rounded-lg border border-neutral-200 bg-white p-6 hover:border-neutral-400 transition"
        >
          <div className="text-sm text-neutral-500">Module</div>
          <div className="mt-1 text-lg font-medium">Case Study Producer</div>
          <p className="mt-2 text-sm text-neutral-600">
            Drive folders waiting to be turned into Wix CMS case studies.
          </p>
        </Link>
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white/50 p-6">
          <div className="text-sm text-neutral-500">Coming later</div>
          <div className="mt-1 text-lg font-medium text-neutral-400">
            Chimera, Email, Landing Pages, Content, Planner
          </div>
        </div>
      </section>
    </div>
  );
}
