'use client';

import { useMemo, useState } from 'react';
import type { CalendarEvent } from '@/lib/calendar/events';
import { swatchForBrand } from '@/lib/email/brand-colours';
import { PLATFORM_DOT } from '@/lib/social/platforms';
import { CalendarEventModal } from './CalendarEventModal';

type Brand = { id: string; slug: string; name: string };

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  pushed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
  Published: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
};

const SOURCE_DOT: Record<string, string> = {
  email: 'bg-neutral-400',
  'case-study': 'bg-fuchsia-500',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function mondayWeekday(d: Date): number {
  const sundayBased = d.getDay();
  return sundayBased === 0 ? 7 : sundayBased;
}

export function CalendarView({
  events,
  brands,
  year,
  month,
}: {
  events: CalendarEvent[];
  brands: Brand[];
  year: number;
  month: number;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const brandsById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);

  const cells = useMemo(() => {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);
    const leadingBlanks = mondayWeekday(startOfMonth) - 1;
    const daysInMonth = endOfMonth.getDate();
    const out: { date: Date | null }[] = [];
    for (let i = 0; i < leadingBlanks; i++) out.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({ date: new Date(year, month - 1, d) });
    }
    while (out.length < 42) out.push({ date: null });
    return out;
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = ymdKey(new Date(e.date));
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const todayKey = ymdKey(new Date());
  const selected = selectedKey ? events.find((e) => e.key === selectedKey) ?? null : null;
  const selectedBrand = selected?.brandId ? brandsById.get(selected.brandId) ?? null : null;

  return (
    <>
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
                  {items.map((e) => {
                    const brand = e.brandId ? brandsById.get(e.brandId) : null;
                    const swatch = swatchForBrand(brand?.slug ?? null);
                    const tone = STATUS_TONE[e.status] ?? 'bg-neutral-100 text-neutral-700 ring-neutral-200';
                    const dot =
                      e.source === 'social' && e.platform
                        ? PLATFORM_DOT[e.platform]
                        : SOURCE_DOT[e.source] ?? 'bg-neutral-400';
                    return (
                      <button
                        key={e.key}
                        type="button"
                        onClick={() => setSelectedKey(e.key)}
                        className={`block w-full rounded border-l-4 ${swatch.border} ${swatch.bg} px-2 py-1.5 text-left text-xs leading-snug hover:opacity-90`}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${dot}`}
                            aria-hidden
                            title={e.source}
                          />
                          {brand ? (
                            <span
                              className={`inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium ring-1 ${swatch.badge} ${swatch.badgeText}`}
                            >
                              {brand.name}
                            </span>
                          ) : null}
                          {e.sector ? (
                            <span className="text-[9px] text-neutral-600">{e.sector}</span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate font-medium text-neutral-800">
                          {e.title}
                        </div>
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center rounded-full px-1.5 py-0 text-[9px] font-medium ring-1 ${tone}`}
                          >
                            {e.status}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CalendarEventModal
        event={selected}
        brand={selectedBrand}
        onClose={() => setSelectedKey(null)}
      />
    </>
  );
}
