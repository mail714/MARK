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

// ---------- Wix Media Manager (file system) ----------

// File descriptor shape we care about for images in a Wix Media folder.
type MediaFileDescriptor = {
  id: string;
  displayName?: string;
  url?: string;
  parentFolderId?: string;
  mediaType?: string;
  media?: {
    image?: {
      image?: {
        id?: string;
        url?: string;
        width?: number;
        height?: number;
        altText?: string;
        filename?: string;
      };
    };
  };
  state?: string;
};

type MediaFolderDescriptor = {
  id: string;
  displayName?: string;
  parentFolderId?: string;
  state?: string;
};

type ListFoldersResponse = {
  folders?: MediaFolderDescriptor[];
  nextCursor?: { cursors?: { next?: string } };
};

type ListFilesResponse = {
  files?: MediaFileDescriptor[];
  nextCursor?: { cursors?: { next?: string } };
};

async function listMediaFolders(args: {
  siteId: string;
  parentFolderId?: string;
}): Promise<MediaFolderDescriptor[]> {
  const out: MediaFolderDescriptor[] = [];
  let cursor: string | undefined;
  for (;;) {
    const params = new URLSearchParams();
    params.set('paging.limit', '100');
    if (args.parentFolderId) params.set('parentFolderId', args.parentFolderId);
    if (cursor) params.set('paging.cursor', cursor);
    const res = await wix.get<ListFoldersResponse>(
      `https://www.wixapis.com/site-media/v1/folders?${params.toString()}`,
      { siteId: args.siteId },
    );
    for (const f of res.folders ?? []) {
      if (f.state && f.state !== 'OK') continue;
      out.push(f);
    }
    cursor = res.nextCursor?.cursors?.next;
    if (!cursor) break;
  }
  return out;
}

async function listMediaImageFiles(args: {
  siteId: string;
  parentFolderId: string;
}): Promise<MediaFileDescriptor[]> {
  const out: MediaFileDescriptor[] = [];
  let cursor: string | undefined;
  for (;;) {
    const params = new URLSearchParams();
    params.set('parentFolderId', args.parentFolderId);
    params.set('mediaTypes', 'IMAGE');
    params.set('paging.limit', '100');
    if (cursor) params.set('paging.cursor', cursor);
    const res = await wix.get<ListFilesResponse>(
      `https://www.wixapis.com/site-media/v1/files?${params.toString()}`,
      { siteId: args.siteId },
    );
    for (const f of res.files ?? []) {
      if (f.state && f.state !== 'OK') continue;
      out.push(f);
    }
    cursor = res.nextCursor?.cursors?.next;
    if (!cursor) break;
  }
  return out;
}

// Find a top-level folder under media-root by exact display name.
async function findMediaFolderByName(args: {
  siteId: string;
  name: string;
}): Promise<MediaFolderDescriptor | null> {
  const folders = await listMediaFolders({ siteId: args.siteId });
  const lower = args.name.toLowerCase();
  return folders.find((f) => (f.displayName ?? '').toLowerCase() === lower) ?? null;
}

export type SignetMediaFolderImage = {
  fileId: string;
  folderName: string;          // top-level folder, used as part of the sector tag
  subfolderName: string | null; // direct parent if nested (e.g. category under Product Images)
  url: string;
  altText: string | null;
  filename: string | null;
  width: number | null;
  height: number | null;
};

// Walks the three operator-curated Media Manager folders on the New Signet
// Site and yields one record per image. 'Product Images 800 x 600' has
// subfolders by category (we use subfolder name as the sector); 'Header images'
// and 'People at work' are flat and tagged with their own folder name.
export async function listAllSignetMediaFolderImages(): Promise<SignetMediaFolderImage[]> {
  const siteId = process.env.WIX_SITE_ID_SIGNET_SIGNS;
  if (!siteId) throw new Error('WIX_SITE_ID_SIGNET_SIGNS is not set');

  const TARGETS = [
    { name: 'Product Images 800 x 600', recurse: true },
    { name: 'Header images', recurse: false },
    { name: 'People at work', recurse: false },
  ];

  const out: SignetMediaFolderImage[] = [];
  for (const target of TARGETS) {
    const top = await findMediaFolderByName({ siteId, name: target.name });
    if (!top) continue;

    if (target.recurse) {
      const subfolders = await listMediaFolders({ siteId, parentFolderId: top.id });
      for (const sub of subfolders) {
        const files = await listMediaImageFiles({ siteId, parentFolderId: sub.id });
        for (const f of files) pushFile(out, f, target.name, sub.displayName ?? null);
      }
      // Plus any images sitting directly in the parent (not in a category subfolder)
      const direct = await listMediaImageFiles({ siteId, parentFolderId: top.id });
      for (const f of direct) pushFile(out, f, target.name, null);
    } else {
      const files = await listMediaImageFiles({ siteId, parentFolderId: top.id });
      for (const f of files) pushFile(out, f, target.name, null);
    }
  }
  return out;
}

function pushFile(
  out: SignetMediaFolderImage[],
  f: MediaFileDescriptor,
  folderName: string,
  subfolderName: string | null,
): void {
  const image = f.media?.image?.image;
  const mediaId = image?.id;
  if (!mediaId) return;
  const url = `https://static.wixstatic.com/media/${mediaId}`;
  out.push({
    fileId: f.id,
    folderName,
    subfolderName,
    url,
    altText: image?.altText ?? null,
    filename: image?.filename ?? f.displayName ?? null,
    width: typeof image?.width === 'number' ? image.width : null,
    height: typeof image?.height === 'number' ? image.height : null,
  });
}

export type SignetSignsImage = {
  itemId: string;
  productName: string | null;
  productType: string | null;     // First producttypetag — used as the sector
  intOrExt: string | null;        // 'internal' | 'external' | 'service'
  ref: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};

// Pulls every Products item from the New Signet Site (06a516dd-...) and yields
// one image per item (each has a single repeaterImage field). product_type_tag
// (e.g. 'shop signs', 'vinyl graphics') is used as the sector for the picker.
export async function listAllSignetSignsImages(): Promise<SignetSignsImage[]> {
  const siteId = process.env.WIX_SITE_ID_SIGNET_SIGNS;
  if (!siteId) throw new Error('WIX_SITE_ID_SIGNET_SIGNS is not set');

  const out: SignetSignsImage[] = [];
  let cursor: string | undefined;
  for (;;) {
    const body: { dataCollectionId: string; query: { cursorPaging: { limit: number; cursor?: string } } } = {
      dataCollectionId: 'Products',
      query: { cursorPaging: { limit: 100 } },
    };
    if (cursor) body.query.cursorPaging.cursor = cursor;
    const res = await wix.post<QueryDataItemsResponse>(
      'https://www.wixapis.com/wix-data/v2/items/query',
      body,
      { siteId },
    );
    for (const it of res.dataItems ?? []) {
      const d = it.data;
      const itemId = typeof d._id === 'string' ? d._id : null;
      if (!itemId) continue;
      const ref = typeof d.repeaterImage === 'string' ? d.repeaterImage : null;
      const url = wixImageRefToStaticUrl(ref);
      if (!ref || !url) continue;
      const dims = wixImageDimensions(ref);
      const productType = Array.isArray(d.producttypetag) && d.producttypetag.length > 0 && typeof d.producttypetag[0] === 'string'
        ? d.producttypetag[0]
        : null;
      const intOrExt = Array.isArray(d.intOrExtOrServiceTag) && d.intOrExtOrServiceTag.length > 0 && typeof d.intOrExtOrServiceTag[0] === 'string'
        ? d.intOrExtOrServiceTag[0]
        : null;
      out.push({
        itemId,
        productName: typeof d.productName === 'string' ? d.productName : null,
        productType,
        intOrExt,
        ref,
        url,
        altText: typeof d.repeaterImageAltText === 'string' ? d.repeaterImageAltText : null,
        width: dims.width,
        height: dims.height,
      });
    }
    cursor = res.pagingMetadata?.cursors?.next;
    if (!cursor) break;
  }
  return out;
}
