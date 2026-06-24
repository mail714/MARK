import { getSearch, updateSearch } from './searches';
import {
  geocode,
  generateGrid,
  placeDetails,
  searchGrid,
  type NearbyResult,
} from './sources/google-places';
import { classifyChain } from './chain-filter';
import {
  domainOf,
  extractPostcode,
  scrapeWebsiteForEmailsAndAddress,
} from './website-scrape';
import { loadSuppressionIndex, isSuppressed, upsertProspect } from './prospects';

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

    // 3. Enrich each place: place details → chain filter → website scrape
    const suppressions = await loadSuppressionIndex();
    let withEmail = 0;
    let withWebsite = 0;
    let chainsSkipped = 0;

    await runWithConcurrency(found, WEBSITE_WORKER_CONCURRENCY, async (place) => {
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
        return; // Don't persist chains at all
      }

      // Address cross-check + email scrape
      let finalAddress = googleAddress;
      let addressNote: string | null = null;
      let emails: string[] = [];
      let postcode = googleAddress ? extractPostcode(googleAddress) : null;

      if (website) {
        try {
          const enrichment = await scrapeWebsiteForEmailsAndAddress(website);
          emails = enrichment.emails;
          if (enrichment.address.postcode) {
            const googlePc = postcode;
            const webPc = enrichment.address.postcode;
            if (googlePc && googlePc !== webPc) {
              const webParts = [
                enrichment.address.street,
                enrichment.address.city,
                webPc,
              ].filter(Boolean);
              finalAddress = webParts.join(', ') || googleAddress;
              postcode = webPc;
              addressNote = `Updated — Google: ${googleAddress} | Website: ${finalAddress}`;
            } else if (googlePc && googlePc === webPc) {
              addressNote = 'Confirmed — matches Google record';
            } else if (!googlePc) {
              postcode = webPc;
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

      // Skip suppressed entries entirely. Tracked as 'chains_skipped' just
      // for the counter — keeps the UI summary honest about volume.
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

      // Update counters as we go so the UI poll shows progress.
      await updateSearch(searchId, {
        prospects_with_email: withEmail,
        prospects_with_website: withWebsite,
        chains_skipped: chainsSkipped,
      });
    });

    await updateSearch(searchId, {
      status: 'completed',
      finished_at: new Date().toISOString(),
      prospects_found: found.length - chainsSkipped,
      prospects_with_email: withEmail,
      prospects_with_website: withWebsite,
      chains_skipped: chainsSkipped,
    });
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
