import Link from 'next/link';
import { listCalendarEvents } from '@/lib/calendar/events';
import { listBrands } from '@/lib/brands';
import { swatchForBrand } from '@/lib/email/brand-colours';
import { CalendarView } from '@/components/calendar/CalendarView';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseMonth(input: string | undefined): { year: number; month: number } {
  const now = new Date();
  if (!input) return { year: now.getFullYear(), month: now.getMonth() + 1 };
  const m = input.match(/^(\d{4})-(\d{2})$/);
  if (!m) return { year: now.getFullYear(), month: now.getMonth() + 1 };
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

function adjacentMonth(year: number, month: number, delta: number): string {
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

function thisMonthString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const { year, month } = parseMonth(params.month);

  // Query a day beyond each month edge: the range is computed in the
  // server's timezone (UTC) but the grid buckets events in the viewer's
  // local time, so a UK event at 00:30 on the 1st is stored in the
  // previous UTC month and would otherwise vanish from both months. The
  // grid simply ignores events whose local day falls outside its cells.
  const startOfMonth = new Date(year, month - 1, 0);
  const endOfMonth = new Date(year, month, 1, 23, 59, 59);

  const [events, brands] = await Promise.all([
    listCalendarEvents(startOfMonth, endOfMonth),
    listBrands(),
  ]);

  const prevMonth = adjacentMonth(year, month, -1);
  const nextMonth = adjacentMonth(year, month, +1);
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const total = events.length;
  const emailCount = events.filter((e) => e.source === 'email').length;
  const caseStudyCount = events.filter((e) => e.source === 'case-study').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketing calendar</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Every campaign and case study, ordered by date. {total} event{total === 1 ? '' : 's'} this month
            {total > 0 ? ` — ${emailCount} email${emailCount === 1 ? '' : 's'}, ${caseStudyCount} case stud${caseStudyCount === 1 ? 'y' : 'ies'}` : ''}.
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <Link
            href={`/calendar?month=${prevMonth}`}
            className="rounded border border-neutral-200 bg-white px-2 py-1 hover:border-neutral-400"
          >
            ← {MONTH_NAMES[(month - 2 + 12) % 12]}
          </Link>
          <Link
            href={`/calendar?month=${thisMonthString()}`}
            className="rounded border border-neutral-200 bg-white px-2 py-1 hover:border-neutral-400"
          >
            Today
          </Link>
          <Link
            href={`/calendar?month=${nextMonth}`}
            className="rounded border border-neutral-200 bg-white px-2 py-1 hover:border-neutral-400"
          >
            {MONTH_NAMES[month % 12]} →
          </Link>
        </div>
      </header>

      <h2 className="text-lg font-medium tracking-tight">{monthLabel}</h2>

      <CalendarView events={events} brands={brands} year={year} month={month} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-600">
        <span className="font-medium uppercase tracking-wider text-neutral-500">Brands</span>
        {brands.map((b) => {
          const s = swatchForBrand(b.slug);
          return (
            <span key={b.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ${s.badge} ${s.badgeText}`}>
              <span className={`h-2 w-2 rounded-sm ${s.border.replace('border-l-', 'bg-')}`} />
              {b.name}
            </span>
          );
        })}
        <span className="ml-2 font-medium uppercase tracking-wider text-neutral-500">Types</span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-neutral-400" />
          Email campaign
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-fuchsia-500" />
          Case study published
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-teal-500" />
          Manual entry
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-pink-500" />
          Instagram
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-600" />
          Facebook
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-neutral-900" />
          TikTok
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-700" />
          LinkedIn
        </span>
      </div>
    </div>
  );
}
