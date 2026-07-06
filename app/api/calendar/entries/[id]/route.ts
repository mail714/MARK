import { NextResponse } from 'next/server';
import {
  deleteCalendarEntry,
  updateCalendarEntry,
  type CalendarEntryStatus,
} from '@/lib/calendar/manual';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/calendar/entries/[id]'>;

const STATUSES = new Set<CalendarEntryStatus>(['planned', 'confirmed', 'done']);

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      title?: unknown;
      notes?: unknown;
      brand_id?: unknown;
      sector?: unknown;
      event_date?: unknown;
      status?: unknown;
    };
    const patch: Parameters<typeof updateCalendarEntry>[1] = {};
    if (typeof body.title === 'string') {
      const t = body.title.trim();
      if (!t) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      patch.title = t;
    }
    if (typeof body.notes === 'string' || body.notes === null) {
      patch.notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
    }
    if (typeof body.brand_id === 'string' || body.brand_id === null) {
      patch.brand_id = body.brand_id || null;
    }
    if (typeof body.sector === 'string' || body.sector === null) {
      patch.sector = typeof body.sector === 'string' ? body.sector.trim() || null : null;
    }
    if (typeof body.event_date === 'string') {
      if (Number.isNaN(Date.parse(body.event_date))) {
        return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
      }
      patch.event_date = new Date(body.event_date).toISOString();
    }
    if (typeof body.status === 'string') {
      if (!STATUSES.has(body.status as CalendarEntryStatus)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      patch.status = body.status as CalendarEntryStatus;
    }
    await updateCalendarEntry(id, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await deleteCalendarEntry(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
