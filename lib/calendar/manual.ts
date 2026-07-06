import { createAdminClient } from '@/lib/supabase/admin';

// CRUD for hand-typed calendar entries — the one calendar source that
// isn't derived from another module.

export type CalendarEntryStatus = 'planned' | 'confirmed' | 'done';

export type CalendarEntry = {
  id: string;
  title: string;
  notes: string | null;
  brand_id: string | null;
  sector: string | null;
  event_date: string;
  status: CalendarEntryStatus;
  created_at: string;
  updated_at: string;
};

export async function listCalendarEntries(
  start: Date,
  end: Date,
): Promise<CalendarEntry[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('calendar_entries')
    .select('*')
    .gte('event_date', start.toISOString())
    .lte('event_date', end.toISOString())
    .order('event_date');
  if (error) throw new Error(`Failed to list calendar entries: ${error.message}`);
  return (data as CalendarEntry[]) ?? [];
}

export async function createCalendarEntry(args: {
  title: string;
  notes?: string | null;
  brand_id?: string | null;
  sector?: string | null;
  event_date: string;
  status?: CalendarEntryStatus;
}): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('calendar_entries')
    .insert({
      title: args.title.trim(),
      notes: args.notes?.trim() || null,
      brand_id: args.brand_id ?? null,
      sector: args.sector?.trim() || null,
      event_date: args.event_date,
      status: args.status ?? 'planned',
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create calendar entry: ${error.message}`);
  return data.id as string;
}

export async function updateCalendarEntry(
  id: string,
  patch: Partial<{
    title: string;
    notes: string | null;
    brand_id: string | null;
    sector: string | null;
    event_date: string;
    status: CalendarEntryStatus;
  }>,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('calendar_entries').update(patch).eq('id', id);
  if (error) throw new Error(`Failed to update calendar entry: ${error.message}`);
}

export async function deleteCalendarEntry(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('calendar_entries').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete calendar entry: ${error.message}`);
}
