import { createAdminClient } from '@/lib/supabase/admin';
import { getCaseStudy } from '@/lib/case-studies';
import { getCaseStudyPhotos } from '@/lib/case-study-photos';
import { draftSocialPosts } from '@/lib/ai/draft-social';
import { createSocialPost } from './posts';
import { getBrandSocialAccounts } from './accounts';
import { platformsForBrand, type SocialPlatform } from './platforms';
import type { Brand } from '@/lib/types';

// Build a prose summary of a case study to seed the AI. Concatenates the
// drafted copy fields if present, falls back to the extracted spec.
function summariseCaseStudy(cs: Awaited<ReturnType<typeof getCaseStudy>>): string {
  if (!cs) return '';
  const parts: string[] = [];
  if (cs.customer_name) parts.push(`Customer: ${cs.customer_name}`);
  if (cs.board_type || cs.board_size) {
    parts.push(`Board: ${[cs.board_type, cs.board_size].filter(Boolean).join(' · ')}`);
  }
  if (cs.back_colour) parts.push(`Back: ${cs.back_colour}`);
  if (cs.text_colour) parts.push(`Text: ${cs.text_colour}`);
  if (cs.edge_details) parts.push(`Edge: ${cs.edge_details}`);
  if (cs.fixings) parts.push(`Fixings: ${cs.fixings}`);

  if (cs.h1_introduction_text) {
    parts.push('');
    parts.push('Drafted intro (HTML, treat as prose):');
    parts.push(cs.h1_introduction_text);
  }
  if (cs.h2_design_highlights_text) {
    parts.push('');
    parts.push('Design highlights:');
    parts.push(cs.h2_design_highlights_text);
  }
  if (cs.h2_summary_text) {
    parts.push('');
    parts.push('Summary section:');
    parts.push(cs.h2_summary_text);
  }
  return parts.join('\n');
}

export async function generateSocialPostsFromCaseStudy(
  caseStudyId: string,
): Promise<{ created: string[]; platforms: SocialPlatform[] }> {
  const cs = await getCaseStudy(caseStudyId);
  if (!cs) throw new Error(`Case study ${caseStudyId} not found`);

  const supabase = createAdminClient();
  type BrandRow = Pick<Brand, 'id' | 'slug' | 'name' | 'website_url'>;
  let brand: BrandRow | null = null;
  if (cs.brand_id) {
    const { data } = await supabase
      .from('brands')
      .select('id, slug, name, website_url')
      .eq('id', cs.brand_id)
      .maybeSingle();
    brand = (data as BrandRow | null) ?? null;
  }

  const platforms = platformsForBrand(brand?.slug);
  if (platforms.length === 0) {
    throw new Error(
      `No social platforms configured for brand ${brand?.slug ?? '(unset)'}. Set the brand on the case study first.`,
    );
  }

  const accounts = brand ? await getBrandSocialAccounts(brand.id) : [];
  const accountsByPlatform = new Map(accounts.map((a) => [a.platform, a]));

  const photos = await getCaseStudyPhotos(caseStudyId);
  const availableMedia = photos
    .filter((p) => p.processed_public_url || p.wix_media_url)
    .map((p) => ({
      url: (p.wix_media_url ?? p.processed_public_url) as string,
      alt: p.alt_text,
    }));

  const sector = (cs.club_types ?? []).join(', ') || null;

  const result = await draftSocialPosts({
    brandName: brand?.name ?? null,
    brandWebsite: brand?.website_url ?? null,
    sector,
    platforms,
    accounts: platforms.map((p) => {
      const a = accountsByPlatform.get(p);
      return {
        platform: p,
        handle: a?.handle ?? null,
        profile_url: a?.profile_url ?? null,
      };
    }),
    source: {
      type: 'case-study',
      title: cs.customer_name ?? cs.drive_folder_name,
      summary: summariseCaseStudy(cs),
      detailUrl: cs.wix_published_url,
    },
    availableMedia,
  });

  // Persist one social_posts row per platform. We trust the model's per-platform
  // pick of media_kind / shot_brief — if it set media_kind='video' for TikTok and
  // wrote a shot_brief, the operator sees that brief on the edit page.
  const created: string[] = [];
  for (const post of result.posts) {
    if (!platforms.includes(post.platform)) continue;
    const id = await createSocialPost({
      brand_id: cs.brand_id ?? null,
      platform: post.platform,
      source_type: 'case-study',
      source_id: cs.id,
      sector,
      internal_name: cs.customer_name ?? cs.drive_folder_name,
      caption: post.caption,
      hashtags: post.hashtags ?? [],
      media_urls: post.media_picks ?? [],
      media_alts: (post.media_picks ?? []).map((url) => {
        const m = availableMedia.find((x) => x.url === url);
        return m?.alt ?? '';
      }),
      media_kind: post.media_kind ?? null,
      shot_brief: post.shot_brief?.trim() ? post.shot_brief.trim() : null,
      cta_url: cs.wix_published_url,
    });
    created.push(id);
  }

  return { created, platforms };
}
