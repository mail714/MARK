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
// Anything in MARK whose dotdigital_id is no longer returned by the live fetch
// is treated as an orphan and removed too — so renames work via the upsert,
// new books are inserted, and deleted books vanish from MARK on the next sync.
// Returns counts so the UI can show what changed.
export async function syncAddressBooks(): Promise<{
  fetched: number;
  inserted: number;
  updated: number;
  removed: number;
}> {
  const live = await listAllAddressBooks();
  const supabase = createAdminClient();

  // Read existing dotdigital_ids so we can split inserts vs updates for the
  // returned counts AND know which local rows are orphans after the upsert.
  const { data: existing, error: lookupErr } = await supabase
    .from('address_books')
    .select('id, dotdigital_id');
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

  // Orphan cleanup. Safety belt: refuse to wipe everything if dotdigital
  // returned zero books — that's almost always an API hiccup, not a real
  // empty account. The operator can still hand-delete a row in Supabase if
  // they ever genuinely want a clean slate.
  let removed = 0;
  if (live.length > 0) {
    const liveIds = new Set(live.map((b) => b.id));
    const orphanRowIds = (existing ?? [])
      .filter((r) => !liveIds.has(r.dotdigital_id))
      .map((r) => r.id as string);
    if (orphanRowIds.length) {
      const { error } = await supabase
        .from('address_books')
        .delete()
        .in('id', orphanRowIds);
      if (error) throw new Error(`Failed to remove orphan address books: ${error.message}`);
      removed = orphanRowIds.length;
    }
  }

  return { fetched: live.length, inserted, updated, removed };
}

export async function updateAddressBookTags(
  id: string,
  fields: { brand_id?: string | null; sector?: string | null },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('address_books').update(fields).eq('id', id);
  if (error) throw new Error(`Failed to update address book tags: ${error.message}`);
}
