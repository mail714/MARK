// Helpers for converting Wix image references into URLs we can use in emails
// and for pulling case-study images out of the ProductsShowcase collection.

import { wix } from './client';

// Convert a wix:image://v1/<media-id>/<filename>#originWidth=W&originHeight=H
// reference into a public CDN URL that works in any email client. Returns null
// for anything that doesn't match the expected shape.
export function wixImageRefToStaticUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const match = ref.match(/^wix:image:\/\/v1\/([^/]+)\//);
  if (!match) return null;
  return `https://static.wixstatic.com/media/${match[1]}`;
}

// Extract the origin width / height encoded in the fragment of a wix:image
// reference. Useful for the picker grid layout.
export function wixImageDimensions(ref: string | null | undefined): {
  width: number | null;
  height: number | null;
} {
  if (!ref) return { width: null, height: null };
  const widthMatch = ref.match(/originWidth=(\d+)/);
  const heightMatch = ref.match(/originHeight=(\d+)/);
  return {
    width: widthMatch ? parseInt(widthMatch[1], 10) : null,
    height: heightMatch ? parseInt(heightMatch[1], 10) : null,
  };
}

export type CaseStudyImage = {
  itemId: string;
  customerName: string | null;
  clubTypes: string[];
  role: 'main' | 'image_2';
  ref: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};

type QueryDataItemsResponse = {
  dataItems?: { data: Record<string, unknown> }[];
  pagingMetadata?: { cursors?: { next?: string } };
};

// Pulls every published case-study item and yields one record per image
// (so each case study contributes a 'main' and an 'image_2' entry where
// both are present). Used by the email image library sync.
export async function listAllCaseStudyImages(): Promise<CaseStudyImage[]> {
  const out: CaseStudyImage[] = [];
  let cursor: string | undefined;
  for (;;) {
    const body: {
      dataCollectionId: string;
      query: { cursorPaging: { limit: number; cursor?: string } };
    } = {
      dataCollectionId: 'ProductsShowcase',
      query: { cursorPaging: { limit: 100 } },
    };
    if (cursor) body.query.cursorPaging.cursor = cursor;
    const res = await wix.post<QueryDataItemsResponse>(
      'https://www.wixapis.com/wix-data/v2/items/query',
      body,
    );
    for (const it of res.dataItems ?? []) {
      const d = it.data;
      const itemId = typeof d._id === 'string' ? d._id : null;
      if (!itemId) continue;
      const customerName =
        typeof d.title_fld === 'string' ? d.title_fld : null;
      const clubTypes = Array.isArray(d.clubType)
        ? (d.clubType as unknown[]).filter((x): x is string => typeof x === 'string')
        : typeof d.clubType === 'string'
          ? safeParseStringArray(d.clubType)
          : [];

      const mainRef = typeof d.mainImage === 'string' ? d.mainImage : null;
      const mainAlt = typeof d.mainImageAltText === 'string' ? d.mainImageAltText : null;
      const mainUrl = wixImageRefToStaticUrl(mainRef);
      if (mainRef && mainUrl) {
        const dims = wixImageDimensions(mainRef);
        out.push({
          itemId,
          customerName,
          clubTypes,
          role: 'main',
          ref: mainRef,
          url: mainUrl,
          altText: mainAlt,
          width: dims.width,
          height: dims.height,
        });
      }

      const image2Ref = typeof d.image2 === 'string' ? d.image2 : null;
      const image2Alt = typeof d.image2AltText === 'string' ? d.image2AltText : null;
      const image2Url = wixImageRefToStaticUrl(image2Ref);
      if (image2Ref && image2Url) {
        const dims = wixImageDimensions(image2Ref);
        out.push({
          itemId,
          customerName,
          clubTypes,
          role: 'image_2',
          ref: image2Ref,
          url: image2Url,
          altText: image2Alt,
          width: dims.width,
          height: dims.height,
        });
      }
    }
    cursor = res.pagingMetadata?.cursors?.next;
    if (!cursor) break;
  }
  return out;
}

function safeParseStringArray(s: string): string[] {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
