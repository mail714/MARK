import { dotdigital } from './client';

export type DotdigitalAddressBook = {
  id: number;
  name: string;
  contacts: number;
  visibility: 'Public' | 'Private' | string;
};

// dotdigital paginates address books via select / skip query params with a
// max page size of 1000. Most accounts have <50 books so a single page is
// nearly always enough; we still loop in case the user grows past the page.
export async function listAllAddressBooks(): Promise<DotdigitalAddressBook[]> {
  const out: DotdigitalAddressBook[] = [];
  const pageSize = 1000;
  let skip = 0;
  for (;;) {
    const page = await dotdigital.get<DotdigitalAddressBook[]>(
      `/v2/address-books?select=${pageSize}&skip=${skip}`,
    );
    out.push(...page);
    if (page.length < pageSize) break;
    skip += pageSize;
  }
  return out;
}
