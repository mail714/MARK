import {
  formatRegisteredAddress,
  searchCompaniesByPostcode,
} from '@/lib/companies-house/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertProspect } from '../prospects';

// For each unique postcode that came out of the Google estate-sweep, look up
// Companies House for every active registered business at that postcode.
// Companies House doesn't expose websites or emails — what we get back is
// canonical company name, registered office, SIC codes (industry codes),
// company number. Useful for finding small / new businesses that aren't
// indexed on Google Maps yet.
//
// Dedupe: if a Google-Places prospect with the same lower(business_name) and
// postcode already exists, we *enrich* it with SIC codes and the company
// number rather than inserting a duplicate. Otherwise we create a new
// prospect tagged source='companies-house'.

export async function enrichSearchWithCompaniesHouse(
  searchId: string,
  postcodes: string[],
): Promise<{ added: number; enriched: number; postcodesProcessed: number }> {
  const supabase = createAdminClient();
  let added = 0;
  let enriched = 0;
  let processed = 0;
  const dedupe = new Set<string>(); // company_number — don't double-up across postcodes

  for (const pc of unique(postcodes)) {
    processed += 1;
    let companies;
    try {
      companies = await searchCompaniesByPostcode(pc, { activeOnly: true, maxResults: 200 });
    } catch (err) {
      console.warn(`companies-house lookup failed for ${pc}:`, err instanceof Error ? err.message : err);
      continue;
    }

    for (const c of companies) {
      if (dedupe.has(c.company_number)) continue;
      dedupe.add(c.company_number);

      // Is there already a prospect (from any source) with this name at this
      // postcode? If so, just enrich it with SIC + company number.
      const { data: existing } = await supabase
        .from('prospects')
        .select('id, sic_codes')
        .ilike('business_name', c.company_name)
        .eq('postcode', c.registered_office_address.postal_code ?? pc)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('prospects')
          .update({
            sic_codes: dedupeArr([...(existing.sic_codes ?? []), ...(c.sic_codes ?? [])]),
            company_number: c.company_number,
          })
          .eq('id', existing.id);
        // Link this Companies House lookup to the originating search too.
        await supabase
          .from('prospect_searches')
          .upsert(
            { prospect_id: existing.id, search_id: searchId },
            { onConflict: 'prospect_id,search_id' },
          );
        enriched += 1;
      } else {
        await upsertProspect({
          source: 'companies-house',
          source_id: c.company_number,
          business_name: c.company_name,
          address: formatRegisteredAddress(c.registered_office_address),
          google_address: null,
          address_note: 'Companies House — registered office',
          postcode: c.registered_office_address.postal_code ?? null,
          phone: null,
          website: null,
          website_domain: null,
          emails: [],
          rating: null,
          reviews: null,
          types: [],
          raw: c as unknown as Record<string, unknown>,
          is_chain: false,
          chain_reason: null,
          search_id: searchId,
        });
        // Backfill SIC + company number on the row we just inserted.
        await supabase
          .from('prospects')
          .update({ sic_codes: c.sic_codes ?? [], company_number: c.company_number })
          .eq('source', 'companies-house')
          .eq('source_id', c.company_number);
        added += 1;
      }
    }
  }

  return { added, enriched, postcodesProcessed: processed };
}

function unique(xs: string[]): string[] {
  return Array.from(new Set(xs.filter(Boolean)));
}

function dedupeArr<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
