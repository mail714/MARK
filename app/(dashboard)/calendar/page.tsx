import Link from 'next/link';
import { listCampaignsForRange, type CalendarCampaign } from '@/lib/email/campaigns';
import { listBrands } from '@/lib/brands';
import { swatchForBrand } from '@/lib/email/brand-colours';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  approved: { label: 'Approved', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  pushed: { label: 'Pushed', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  failed: { label: 'Failed', tone: 'bg-red-50 text-red-700 ring-red-200' },
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Mon-Sun week ordering, UK convention.
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

// Returns the 1-indexed Monday-based weekday of a given date (1 = Mon … 7 = Sun).
function mondayWeekday(d: Date): number {
  const sundayBased = d.getDay(); // 0 = Sun
  return sundayBased === 0 ? 7 : sundayBased;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const { year, month } = parseMonth(params.month);

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);

  const [campaigns, brands] = await Promise.all([
    listCampaignsForRange(startOfMonth, endOfMonth),
    listBrands(),
  ]);
  const brandsById = new Map(brands.map((b) => [b.id, b]));

  // Group campaigns by YYYY-MM-DD.
  const byDay = new Map<string, CalendarCampaign[]>();
  for (const c of campaigns) {
    if (!c.planned_send_at) continue;
    const key = ymdKey(new Date(c.planned_send_at));
    const arr = byDay.get(key) ?? [];
    arr.push(c);
    byDay.set(key, arr);
  }

  // Build the 6-week grid (always 42 cells) so the calendar's shape is stable
  // regardless of month length.
  const leadingBlanks = mondayWeekday(startOfMonth) - 1;
  const daysInMonth = endOfMonth.getDate();
  const cells: { date: Date | null }[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month - 1, d) });
  }
  while (cells.length < 42) cells.push({ date: null });

  const todayKey = ymdKey(new Date());
  const prevMonth = adjacentMonth(year, month, -1);
  const nextMonth = adjacentMonth(year, month, +1);
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const total = campaigns.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Marketing calendar</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Every email campaign with a planned send date. {total} scheduled this month.
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

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wider text-neutral-500">
          {WEEKDAY_LABELS.map((day) => (
            <div key={day} className="px-2 py-2 text-center">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            if (!cell.date) {
              return (
                <div
                  key={`blank-${i}`}
                  className="min-h-28 border-b border-r border-neutral-100 bg-neutral-50/40 last:border-r-0"
                />
              );
            }
            const key = ymdKey(cell.date);
            const items = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={`min-h-28 border-b border-r border-neutral-100 p-1.5 last:border-r-0 ${
                  isToday ? 'bg-amber-50/40' : ''
                }`}
              >
                <div className={`mb-1 text-xs ${isToday ? 'font-semibold text-amber-800' : 'text-neutral-500'}`}>
                  {cell.date.getDate()}
                </div>
                <div className="space-y-1">
                  {items.map((c) => {
                    const brand = c.brand_id ? brandsById.get(c.brand_id) : null;
                    const swatch = swatchForBrand(brand?.slug ?? null);
                    const status = STATUS_LABEL[c.status] ?? STATUS_LABEL.draft;
                    return (
                      <Link
                        key={c.id}
                        href={`/emails/campaigns/${c.id}`}
                        className={`block rounded border-l-4 ${swatch.border} ${swatch.bg} px-2 py-1.5 text-xs leading-snug hover:opacity-90`}
                      >
                        <div className="flex items-center gap-1">
                          {brand ? (
                            <span
                              className={`inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium ring-1 ${swatch.badge} ${swatch.badgeText}`}
                            >
                              {brand.name}
                            </span>
                          ) : null}
                          {c.sector ? (
                            <span className="text-[9px] text-neutral-600">{c.sector}</span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate font-medium text-neutral-800">
                          {c.internal_name ?? c.subject ?? '(untitled)'}
                        </div>
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium ring-1 ${status.tone}`}
                          >
                            {status.label}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
      </div>
    </div>
  );
}
