import { wix } from './client';
import { caseStudySlugPath } from './slug';
import type { CaseStudy } from '@/lib/types';

const COLLECTION_ID = 'ProductsShowcase';

// Maps our case_studies row + uploaded image URIs onto the field keys used
// by the Wix Products (case studies) collection. Field names below are
// dictated by the live Wix collection — including the quirky ones like
// `h2DesignHighlights1` for the Summary title and `woodStain1` for text colour.
export type WixCaseStudyPayload = {
  caseStudy: CaseStudy;
  mainImageUri: string;
  mainImageAlt: string | null;
  image2Uri: string;
  image2Alt: string | null;
};

function mapPayload({ caseStudy, mainImageUri, mainImageAlt, image2Uri, image2Alt }: WixCaseStudyPayload) {
  // Re-use the slug from the first publish (kept on the row) so SEO equity and
  // any external links don't break across re-publishes. First publish derives
  // a clean slug from the H1 title.
  const slugPath = caseStudy.wix_url_slug
    ? caseStudy.wix_url_slug
    : caseStudySlugPath(caseStudy.h1_page_title ?? caseStudy.customer_name ?? caseStudy.drive_folder_name);

  return {
    'link-products-showcase-title_fld': slugPath,
    title_fld: caseStudy.h1_page_title,
    description_fld: caseStudy.h1_introduction_text,
    h2DesignHighlights: caseStudy.h2_design_highlights_title,
    h2DesignHighlightsText: caseStudy.h2_design_highlights_text,
    h2DesignHighlights1: caseStudy.h2_summary_title,
    h2SummaryText: caseStudy.h2_summary_text,
    h2CtaTitle: caseStudy.cta_text,
    pageMetaTitle: caseStudy.page_meta_title,
    pageMetaDescription: caseStudy.page_meta_description,
    schemaTitle: caseStudy.schema_title,
    schemaDesc: caseStudy.schema_desc,
    boardType: caseStudy.board_type,
    boardSize: caseStudy.board_size,
    woodStain: caseStudy.back_colour,
    woodStain1: caseStudy.text_colour,
    frameDetails: caseStudy.edge_details,
    fixings: caseStudy.fixings,
    clubType: caseStudy.club_types,
    mainImage: mainImageUri,
    mainImageAltText: mainImageAlt,
    image2: image2Uri,
    image2AltText: image2Alt,
  };
}

type DataItemResponse = {
  dataItem: {
    id: string;
    dataCollectionId: string;
    data: Record<string, unknown>;
  };
};

// Delete a CMS item by id. 404 is treated as success (already gone) so the
// caller can call this idempotently when resetting state.
export async function deleteWixItem(itemId: string): Promise<{ deleted: boolean }> {
  try {
    await wix.delete(
      `https://www.wixapis.com/wix-data/v2/items/${encodeURIComponent(itemId)}?dataCollectionId=${COLLECTION_ID}`,
    );
    return { deleted: true };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return { deleted: false };
    throw err;
  }
}

// Insert a new CMS item, or update if the case study already has a wix_item_id.
// Returns the Wix item id and the auto-generated URL slug.
export async function publishCaseStudy(
  payload: WixCaseStudyPayload,
): Promise<{ id: string; slug: string | null }> {
  const data = mapPayload(payload);
  const existingId = payload.caseStudy.wix_item_id;

  // Use Save (upsert) so re-publishes update in place. Include the existing
  // _id when we have one so we update rather than insert.
  const body = {
    dataCollectionId: COLLECTION_ID,
    dataItem: {
      ...(existingId ? { id: existingId } : {}),
      data,
    },
  };
  const res = await wix.post<DataItemResponse>(
    'https://www.wixapis.com/wix-data/v2/items/save',
    body,
  );

  const item = res.dataItem;
  const slugField = item.data['link-products-showcase-title_fld'];
  const slug = typeof slugField === 'string' ? slugField : null;
  return { id: item.id, slug };
}
