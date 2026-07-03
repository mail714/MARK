import { getSearch, updateSearch } from './searches';
import {
  geocode,
  generateGrid,
  nearbyAroundPoint,
  placeDetails,
  searchGrid,
  textSearch,
  type NearbyResult,
} from './sources/google-places';
import { classifyChain } from './chain-filter';
import {
  domainOf,
  extractPostcode,
  scrapeWebsiteForEmailsAndAddress,
} from './website-scrape';
import {
  loadSuppressionIndex,
  isSuppressed,
  upsertProspect,
  linkProspectToSearch,
  loadExistingProspectsByPlaceId,
} from './prospects';
import { enrichSearchWithCompaniesHouse } from './sources/companies-house';
import { createAdminClient } from '@/lib/supabase/admin';

const WEBSITE_WORKER_CONCURRENCY = 6;

// Runs a Google Places search end to end. Updates the chimera_searches row
// with progress as it goes so the UI poller has something to show. Safe to
// call from a fire-and-forget context (e.g. setImmediate from a Next route)
// because every step persists state — a crash mid-run still leaves the
// already-processed prospects in the DB.
export async function runGooglePlacesSearch(searchId: string): Promise<void> {
  const search = await getSearch(searchId);
  if (!search) throw new Error(`Search ${searchId} not found`);
  if (search.source !== 'google-places') throw new Error(`Search ${searchId} is not a google-places search`);
  if (!search.location) throw new Error('Search has no location');

  await updateSearch(searchId, {
    status: 'running',
    started_at: new Date().toISOString(),
    last_error: null,
  });

  try {
    // 1. Geocode + grid
    const geo = await geocode(search.location);
    const grid = generateGrid(
      geo.bounds,
      search.grid_radius_m ?? 1500,
      (search.grid_overlap_pct ?? 40) / 100,
    );
    await updateSearch(searchId, { grid_cells_total: grid.length });

    // 2. Run the grid scan — collect unique places
    const found: NearbyResult[] = [];
    await searchGrid({
      grid,
      radiusM: search.grid_radius_m ?? 1500,
      type: search.category,
      keyword: search.category && /\s/.test(search.category) ? search.category : null,
      maxResults: search.max_results ?? 500,
      onNewResult: (r) => {
        found.push(r);
      },
      onCellComplete: async ({ cellIndex, prospectsFound }) => {
        await updateSearch(searchId, {
          grid_cells_processed: cellIndex,
          prospects_found: prospectsFound,
        });
      },
    });

    // 3. Enrich each place: place details → chain filter → website scrape.
    // Shared with the estate-sweep runner — includes the already-known
    // skip so re-runs don't re-pay for businesses we have.
    await enrichAndPersist(searchId, search, found);

    await updateSearch(searchId, {
      status: 'completed',
      finished_at: new Date().toISOString(),
    });
    await maybeRecordSavedRun(searchId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSearch(searchId, {
      status: 'failed',
      finished_at: new Date().toISOString(),
      last_error: message,
    });
    throw err;
  }
}

// Bumps the saved_search row's last_run_prospects + last_run_at after a
// search completes, when that search was linked to a saved segment. No-op
// if the search wasn't from a saved segment.
async function maybeRecordSavedRun(searchId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('chimera_searches')
    .select('saved_search_id, prospects_found')
    .eq('id', searchId)
    .maybeSingle();
  if (!data) return;
  const row = data as { saved_search_id: string | null; prospects_found: number };
  if (!row.saved_search_id) return;
  await supabase
    .from('saved_searches')
    .update({
      last_run_prospects: row.prospects_found,
      last_run_at: new Date().toISOString(),
    })
    .eq('id', row.saved_search_id);
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        await task(items[idx]);
      } catch (err) {
        console.warn('chimera worker error:', err instanceof Error ? err.message : err);
      }
    }
  });
  await Promise.all(workers);
}


// Estate-sweep: text search for parks / estates / office buildings, then a
// tight nearby-search around each one to enumerate every tenant. Same
// enrichment pipeline as the grid runner after that.
export async function runEstateSweepSearch(searchId: string): Promise<void> {
  const search = await getSearch(searchId);
  if (!search) throw new Error(`Search ${searchId} not found`);
  if (!search.location) throw new Error('Search has no location');

  await updateSearch(searchId, {
    status: 'running',
    started_at: new Date().toISOString(),
    last_error: null,
  });

  try {
    const seeds = search.sweep_seeds.length > 0 ? search.sweep_seeds : ['business park'];
    const radius = search.sweep_radius_m ?? 400;
    const cap = search.max_results ?? 500;

    // Stage 1: find the parks themselves. One text search per seed phrase.
    const estates: NearbyResult[] = [];
    const estateIds = new Set<string>();
    for (let i = 0; i < seeds.length; i++) {
      const phrase = `${seeds[i]} in ${search.location}`;
      const found = await textSearch(phrase);
      for (const f of found) {
        if (f.place_id && !estateIds.has(f.place_id)) {
          estateIds.add(f.place_id);
          estates.push(f);
        }
      }
      await updateSearch(searchId, {
        grid_cells_total: estates.length,
        grid_cells_processed: i + 1,
      });
    }

    // Stage 2: nearby sweep around each park.
    const tenants: NearbyResult[] = [];
    const seenTenants = new Set<string>();
    let cellsProcessed = seeds.length;
    for (const estate of estates) {
      if (tenants.length >= cap) break;
      const loc = estate.geometry?.location;
      if (!loc) continue;
      const inside = await nearbyAroundPoint({
        lat: loc.lat,
        lng: loc.lng,
        radiusM: radius,
      });
      for (const t of inside) {
        if (!t.place_id || seenTenants.has(t.place_id)) continue;
        seenTenants.add(t.place_id);
        tenants.push(t);
      }
      cellsProcessed += 1;
      await updateSearch(searchId, {
        grid_cells_processed: cellsProcessed,
        grid_cells_total: seeds.length + estates.length,
        prospects_found: tenants.length,
      });
    }

    // Stage 3: enrichment — same pipeline as the grid runner.
    await enrichAndPersist(searchId, search, tenants);

    // Stage 4 (optional): Companies House — for every postcode we've now
    // confirmed for this search, look up active registered companies and
    // either enrich an existing prospect or insert as 'companies-house'.
    if (search.pull_companies_house) {
      const supabase = createAdminClient();
      const { data: rows } = await supabase
        .from('prospects')
        .select('postcode')
        .in('id', await (async () => {
          const { data } = await supabase
            .from('prospect_searches')
            .select('prospect_id')
            .eq('search_id', searchId);
          return ((data ?? []) as { prospect_id: string }[]).map((r) => r.prospect_id);
        })());
      const postcodes = ((rows ?? []) as { postcode: string | null }[])
        .map((r) => r.postcode)
        .filter((p): p is string => !!p);
      try {
        await enrichSearchWithCompaniesHouse(searchId, postcodes);
        // Re-tally found counter since CH may have added new rows.
        const { count } = await supabase
          .from('prospect_searches')
          .select('prospect_id', { count: 'exact', head: true })
          .eq('search_id', searchId);
        if (count !== null) {
          await updateSearch(searchId, { prospects_found: count });
        }
      } catch (err) {
        console.warn('Companies House enrichment failed:', err instanceof Error ? err.message : err);
      }
    }

    await updateSearch(searchId, {
      status: 'completed',
      finished_at: new Date().toISOString(),
    });
    await maybeRecordSavedRun(searchId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSearch(searchId, {
      status: 'failed',
      finished_at: new Date().toISOString(),
      last_error: message,
    });
    throw err;
  }
}

// Shared enrichment loop: place details → chain filter → suppression check
// → website scrape → upsert. Used by both the grid and estate-sweep
// runners. Businesses already in the database are linked to the new search
// and skipped — no second place-details call, no re-scrape — so re-running
// or widening a search only pays for businesses we haven't seen before.
async function enrichAndPersist(
  searchId: string,
  search: Awaited<ReturnType<typeof getSearch>>,
  candidates: NearbyResult[],
): Promise<void> {
  if (!search) return;
  const suppressions = await loadSuppressionIndex();
  const existingByPlaceId = await loadExistingProspectsByPlaceId(
    candidates.map((c) => c.place_id).filter(Boolean),
  );
  let withEmail = 0;
  let withWebsite = 0;
  let chainsSkipped = 0;
  let alreadyKnown = 0;

  await runWithConcurrency(candidates, WEBSITE_WORKER_CONCURRENCY, async (place) => {
    const known = existingByPlaceId.get(place.place_id);
    if (known) {
      await linkProspectToSearch(known.id, searchId);
      if (known.emails.length > 0) withEmail += 1;
      if (known.website) withWebsite += 1;
      alreadyKnown += 1;
      await updateSearch(searchId, {
        prospects_with_email: withEmail,
        prospects_with_website: withWebsite,
      });
      return;
    }

    const details = await placeDetails(place.place_id);
    if (details?.business_status === 'CLOSED_PERMANENTLY') return;

    const website = details?.website ?? null;
    const phone = details?.formatted_phone_number ?? null;
    const googleAddress = details?.formatted_address ?? place.vicinity ?? place.formatted_address ?? null;
    const rating = details?.rating ?? place.rating ?? null;
    const reviews = details?.user_ratings_total ?? place.user_ratings_total ?? null;
    const types = details?.types ?? place.types ?? [];

    const chain = search.apply_chain_filter
      ? classifyChain(place.name, website, reviews ?? 0)
      : { isChain: false, reason: '' };
    if (chain.isChain) {
      chainsSkipped += 1;
      return;
    }

    let finalAddress = googleAddress;
    let addressNote: string | null = null;
    let emails: string[] = [];
    let postcode = googleAddress ? extractPostcode(googleAddress) : null;

    if (website) {
      try {
        const enrichment = await scrapeWebsiteForEmailsAndAddress(website);
        emails = enrichment.emails;
        if (enrichment.address.postcode) {
          if (postcode && postcode !== enrichment.address.postcode) {
            const webParts = [
              enrichment.address.street,
              enrichment.address.city,
              enrichment.address.postcode,
            ].filter(Boolean);
            finalAddress = webParts.join(', ') || googleAddress;
            postcode = enrichment.address.postcode;
            addressNote = `Updated — Google: ${googleAddress} | Website: ${finalAddress}`;
          } else if (postcode === enrichment.address.postcode) {
            addressNote = 'Confirmed — matches Google record';
          } else if (!postcode) {
            postcode = enrichment.address.postcode;
            addressNote = 'Address taken from website (no postcode in Google record)';
          }
        } else {
          addressNote = 'No address found on website';
        }
      } catch {
        addressNote = 'Website scrape failed';
      }
    }

    const domain = domainOf(website);
    if (isSuppressed({ emails, domain, name: place.name }, suppressions)) {
      chainsSkipped += 1;
      return;
    }

    await upsertProspect({
      source: 'google-places',
      source_id: place.place_id,
      business_name: place.name,
      address: finalAddress,
      google_address: googleAddress,
      address_note: addressNote,
      postcode,
      phone,
      website,
      website_domain: domain,
      emails,
      rating,
      reviews,
      types,
      raw: { ...place, details },
      is_chain: false,
      chain_reason: null,
      search_id: searchId,
    });

    if (emails.length > 0) withEmail += 1;
    if (website) withWebsite += 1;
    await updateSearch(searchId, {
      prospects_with_email: withEmail,
      prospects_with_website: withWebsite,
      chains_skipped: chainsSkipped,
    });
  });

  await updateSearch(searchId, {
    prospects_found: candidates.length - chainsSkipped,
    prospects_with_email: withEmail,
    prospects_with_website: withWebsite,
    chains_skipped: chainsSkipped,
  });
  if (alreadyKnown > 0) {
    console.log(
      `chimera search ${searchId}: ${alreadyKnown}/${candidates.length} businesses already known — skipped paid enrichment`,
    );
  }
}
