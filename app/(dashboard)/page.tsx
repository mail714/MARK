import Link from 'next/link';

type ModuleCard = {
  href: string;
  title: string;
  description: string;
};

const LIVE_MODULES: ModuleCard[] = [
  {
    href: '/case-studies',
    title: 'Case Study Producer',
    description:
      'Drive folders waiting to be turned into Wix CMS case studies. Generate, review, push to Wix, archive.',
  },
  {
    href: '/emails',
    title: 'Email Campaigns',
    description:
      'Draft + push email campaigns to dotdigital. Address books, image library, templates and pre-flight checks all live here.',
  },
  {
    href: '/social',
    title: 'Social Posts',
    description:
      'Fan a case study or email out into one draft post per platform (Instagram, Facebook, TikTok, LinkedIn). Edit, schedule, publish.',
  },
  {
    href: '/chimera',
    title: 'Chimera Prospecting',
    description:
      'Discover new prospects via Google Maps + website scrape, or import a CSV. Review, dedupe, assign to a brand, push to dotdigital.',
  },
  {
    href: '/calendar',
    title: 'Marketing Calendar',
    description:
      'Month view of every campaign, case study and social post with a planned date. Brand-coloured per row, sector tagged.',
  },
];

const COMING_LATER = [
  { title: 'Landing Pages', description: 'Wix Studio dynamic CMS pages bound to email campaigns.' },
  { title: 'Social Scheduling', description: 'Push approved social drafts to Buffer / Metricool.' },
  { title: 'GA4 attribution', description: 'Post-click sessions and conversions per email, per link.' },
  { title: 'Marketing Planner', description: 'Sector-aware content calendar feeding everything else.' },
];

export default function OverviewPage() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Multi-brand marketing dashboard for Signet Signs, Honours Boards and Signet Play.
          Click into whichever section you want to work on.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Live modules
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {LIVE_MODULES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="block rounded-lg border border-neutral-200 bg-white p-6 transition hover:border-neutral-400"
            >
              <div className="text-xs uppercase tracking-wider text-neutral-500">Module</div>
              <div className="mt-1 text-lg font-medium">{m.title}</div>
              <p className="mt-2 text-sm text-neutral-600">{m.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Coming later
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {COMING_LATER.map((m) => (
            <div
              key={m.title}
              className="rounded-lg border border-dashed border-neutral-300 bg-white/50 p-4"
            >
              <div className="text-sm font-medium text-neutral-700">{m.title}</div>
              <p className="mt-1 text-xs text-neutral-500">{m.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
