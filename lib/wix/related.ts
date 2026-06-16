// Auto-populate the "Related Case Studies" multi-reference field on a newly
// published Wix item. Writes links in BOTH directions so the new board shows
// 4 related boards on its own dynamic page AND appears as a related entry on
// each of theirs (the dynamic page's repeater renders the reverse link).
//
// Buckets the new board by club type into the same clusters used site-wide.
// Picks the four least-connected boards in the same bucket so the graph stays
// balanced over time.

import { wix } from './client';

const COLLECTION = 'ProductsShowcase';
const FIELD = 'multireference';
const TARGET = 4;

type ClusterKey = 'Cricket' | 'Golf' | 'Education' | 'Institution' | 'GeneralSports';

type BoardItem = {
  id: string;
  title: string;
  clubType: string[];
};

function clusterKey(clubTypes: string[] = [], title = ''): ClusterKey {
  const club = clubTypes.map((c) => c.toLowerCase());
  const has = (t: string) => club.includes(t.toLowerCase());
  const titleHas = (re: RegExp) => re.test(title);

  if (has('Cricket') || (club.length === 0 && titleHas(/cricket/i))) return 'Cricket';
  if (has('Golf')) return 'Golf';
  if (has('Schools') || titleHas(/school|college|university|prep|gdst/i)) return 'Education';
  if (has('Masons') || has('Government') || has('Religious') || has('Corporate')) return 'Institution';
  return 'GeneralSports';
}

type QueryDataItemsResponse = {
  dataItems?: { data: Record<string, unknown> }[];
  pagingMetadata?: { cursors?: { next?: string } };
};

async function fetchAllBoards(): Promise<BoardItem[]> {
  const out: BoardItem[] = [];
  let cursor: string | undefined;
  do {
    const body: { dataCollectionId: string; query: { cursorPaging: { limit: number; cursor?: string } } } = {
      dataCollectionId: COLLECTION,
      query: { cursorPaging: { limit: 100 } },
    };
    if (cursor) body.query.cursorPaging.cursor = cursor;
    const data = await wix.post<QueryDataItemsResponse>(
      'https://www.wixapis.com/wix-data/v2/items/query',
      body,
    );
    for (const it of data.dataItems ?? []) {
      const d = it.data;
      const id = typeof d._id === 'string' ? d._id : null;
      if (!id) continue;
      out.push({
        id,
        title: typeof d.title_fld === 'string' ? d.title_fld : '',
        clubType: Array.isArray(d.clubType) ? (d.clubType as string[]) : [],
      });
    }
    cursor = data.pagingMetadata?.cursors?.next;
  } while (cursor);
  return out;
}

type QueryReferencedResponse = {
  results?: unknown[];
  dataItems?: unknown[];
};

async function inboundCount(itemId: string): Promise<number> {
  const data = await wix.post<QueryReferencedResponse>(
    'https://www.wixapis.com/wix-data/v2/items/query-referenced',
    {
      dataCollectionId: COLLECTION,
      referringItemFieldName: FIELD,
      referringItemId: itemId,
      paging: { limit: 50 },
    },
  );
  return (data.results ?? data.dataItems ?? []).length;
}

// Link a freshly-created case study into its cluster, both directions. Returns
// the boards it was linked to so the caller can log / display them.
export async function linkRelatedCaseStudies(
  newItemId: string,
  clubTypes: string[] = [],
  title = '',
): Promise<{ linkedTo: { id: string; title: string }[]; cluster: ClusterKey }> {
  const cluster = clusterKey(clubTypes, title);

  const all = await fetchAllBoards();
  const mates = all.filter(
    (b) => b.id !== newItemId && clusterKey(b.clubType, b.title) === cluster,
  );
  if (mates.length === 0) return { linkedTo: [], cluster };

  const withCounts = await Promise.all(
    mates.map(async (m) => ({ m, inbound: await inboundCount(m.id) })),
  );
  withCounts.sort((a, b) => a.inbound - b.inbound || a.m.title.localeCompare(b.m.title));
  const chosen = withCounts.slice(0, TARGET).map((x) => x.m);

  // 1. New board → chosen mates (so chosen mates appear on the new board's page).
  await wix.post('https://www.wixapis.com/wix-data/v2/items/replace-references', {
    dataCollectionId: COLLECTION,
    referringItemFieldName: FIELD,
    referringItemId: newItemId,
    newReferencedItemIds: chosen.map((c) => c.id),
  });

  // 2. Each chosen mate → new board (so the new board appears on each mate's page).
  await wix.post('https://www.wixapis.com/wix-data/v2/bulk/items/insert-references', {
    dataCollectionId: COLLECTION,
    dataItemReferences: chosen.map((c) => ({
      referringItemFieldName: FIELD,
      referringItemId: c.id,
      referencedItemId: newItemId,
    })),
  });

  return {
    linkedTo: chosen.map((c) => ({ id: c.id, title: c.title })),
    cluster,
  };
}
