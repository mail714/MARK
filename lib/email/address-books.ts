import { createAdminClient } from '@/lib/supabase/admin';
import { listAllAddressBooks } from '@/lib/dotdigital/address-books';

export type AddressBookRow = {
  id: string;
  dotdigital_id: number;
  name: string;
  contact_count: number | null;
  visibility: string | null;
  brand_id: string | null;
  sector: string | null;
  last_synced_at: string;
};

export async function getAddressBooks(): Promise<AddressBookRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('address_books')
    .select('*')
    .order('name');
  if (error) throw new Error(`Failed to load address books: ${error.message}`);
  return (data as AddressBookRow[]) ?? [];
}

// Pull the live list of address books from dotdigital and upsert them locally.
// Returns counts so the UI can show what changed in the sync.
export async function syncAddressBooks(): Promise<{
  fetched: number;
  inserted: number;
  updated: number;
}> {
  const live = await listAllAddressBooks();
  const supabase = createAdminClient();

  // Read existing dotdigital_ids so we can split inserts vs updates for the
  // returned counts. Single round-trip.
  const ids = live.map((b) => b.id);
  const { data: existing, error: lookupErr } = ids.length
    ? await supabase.from('address_books').select('dotdigital_id').in('dotdigital_id', ids)
    : { data: [] as { dotdigital_id: number }[], error: null };
  if (lookupErr) throw new Error(`Failed to read existing address books: ${lookupErr.message}`);
  const existingIds = new Set((existing ?? []).map((r) => r.dotdigital_id));

  const rows = live.map((b) => ({
    dotdigital_id: b.id,
    name: b.name,
    contact_count: typeof b.contacts === 'number' ? b.contacts : null,
    visibility: b.visibility ?? null,
    last_synced_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await supabase
      .from('address_books')
      .upsert(rows, { onConflict: 'dotdigital_id' });
    if (error) throw new Error(`Failed to upsert address books: ${error.message}`);
  }

  let inserted = 0;
  let updated = 0;
  for (const b of live) {
    if (existingIds.has(b.id)) updated++;
    else inserted++;
  }
  return { fetched: live.length, inserted, updated };
}

export async function updateAddressBookTags(
  id: string,
  fields: { brand_id?: string | null; sector?: string | null },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('address_books').update(fields).eq('id', id);
  if (error) throw new Error(`Failed to update address book tags: ${error.message}`);
}
