import { NextResponse } from 'next/server';
import { createCalendarEntry, type CalendarEntryStatus } from '@/lib/calendar/manual';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = new Set<CalendarEntryStatus>(['planned', 'confirmed', 'done']);

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
      notes?: unknown;
      brand_id?: unknown;
      sector?: unknown;
      event_date?: unknown;
      status?: unknown;
    };
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const eventDate = typeof body.event_date === 'string' ? body.event_date : '';
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!eventDate || Number.isNaN(Date.parse(eventDate))) {
      return NextResponse.json({ error: 'A valid date is required' }, { status: 400 });
    }
    const status =
      typeof body.status === 'string' && STATUSES.has(body.status as CalendarEntryStatus)
        ? (body.status as CalendarEntryStatus)
        : 'planned';

    const id = await createCalendarEntry({
      title,
      notes: typeof body.notes === 'string' ? body.notes : null,
      brand_id: typeof body.brand_id === 'string' && body.brand_id ? body.brand_id : null,
      sector: typeof body.sector === 'string' ? body.sector : null,
      event_date: new Date(eventDate).toISOString(),
      status,
    });
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
