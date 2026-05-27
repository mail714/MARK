import { createAdminClient } from '@/lib/supabase/admin';
import { getCaseStudyPhotos } from '@/lib/case-study-photos';
import { moveFolderToPublished } from '@/lib/drive/move';
import { importImageFromUrl } from '@/lib/wix/media';
import { publishCaseStudy as publishToWix } from '@/lib/wix/cms';
import type { CaseStudy } from '@/lib/types';

const REQUIRED_TEXT_FIELDS = [
  'h1_page_title',
  'h1_introduction_text',
  'h2_design_highlights_title',
  'h2_design_highlights_text',
  'h2_summary_title',
  'h2_summary_text',
  'cta_text',
  'page_meta_title',
  'page_meta_description',
  'schema_title',
  'schema_desc',
] as const;

function validateReadyForPublish(cs: CaseStudy): string[] {
  const missing: string[] = [];
  for (const f of REQUIRED_TEXT_FIELDS) {
    const v = cs[f];
    if (!v || (typeof v === 'string' && v.trim() === '')) missing.push(f);
  }
  return missing;
}

export async function publishCaseStudy(id: string): Promise<{ wixItemId: string; wixUrlSlug: string | null }> {
  const supabase = createAdminClient();
  const { data: csData, error: csErr } = await supabase
    .from('case_studies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (csErr) throw new Error(`Failed to load case study: ${csErr.message}`);
  if (!csData) throw new Error(`Case study ${id} not found`);
  const cs = csData as CaseStudy;

  const missing = validateReadyForPublish(cs);
  if (missing.length) {
    throw new Error(`Cannot publish — missing fields: ${missing.join(', ')}`);
  }

  const photos = await getCaseStudyPhotos(id);
  const main = photos.find((p) => p.role === 'main');
  const image2 = photos.find((p) => p.role === 'image_2');
  if (!main?.processed_public_url) {
    throw new Error('Cannot publish — main image not selected. Process photos first.');
  }
  if (!image2?.processed_public_url) {
    throw new Error('Cannot publish — image 2 not selected. Process photos first.');
  }

  try {
    // Re-use already-uploaded Wix Media files if we have them; otherwise
    // import from Supabase Storage public URL.
    let mainUri = main.wix_media_url;
    if (!mainUri) {
      const uploaded = await importImageFromUrl({
        url: main.processed_public_url,
        displayName: `${cs.so_number ?? cs.id}-main.jpg`,
      });
      mainUri = uploaded.wixImageUri;
      await supabase
        .from('case_study_photos')
        .update({ wix_media_url: mainUri })
        .eq('id', main.id);
    }

    let image2Uri = image2.wix_media_url;
    if (!image2Uri) {
      const uploaded = await importImageFromUrl({
        url: image2.processed_public_url,
        displayName: `${cs.so_number ?? cs.id}-image2.jpg`,
      });
      image2Uri = uploaded.wixImageUri;
      await supabase
        .from('case_study_photos')
        .update({ wix_media_url: image2Uri })
        .eq('id', image2.id);
    }

    const result = await publishToWix({
      caseStudy: cs,
      mainImageUri: mainUri,
      mainImageAlt: main.alt_text,
      image2Uri,
      image2Alt: image2.alt_text,
    });

    const wixPublishedUrl = result.slug
      ? `https://www.honours-boards.co.uk${result.slug}`
      : null;

    const { error: updateErr } = await supabase
      .from('case_studies')
      .update({
        status: 'published',
        wix_item_id: result.id,
        wix_url_slug: result.slug,
        wix_published_url: wixPublishedUrl,
        published_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', id);
    if (updateErr) throw new Error(`Failed to save publish state: ${updateErr.message}`);

    // Non-fatal: archive the Drive folder. If this fails the publish is
    // already done — log the issue on the row but don't unwind.
    const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;
    if (rootId) {
      try {
        await moveFolderToPublished(cs.drive_folder_id, rootId);
      } catch (moveErr) {
        const moveMessage = moveErr instanceof Error ? moveErr.message : String(moveErr);
        await supabase
          .from('case_studies')
          .update({ last_error: `Published OK but failed to archive Drive folder: ${moveMessage}` })
          .eq('id', id);
      }
    }

    return { wixItemId: result.id, wixUrlSlug: result.slug };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('case_studies')
      .update({ last_error: message })
      .eq('id', id);
    throw err;
  }
}
