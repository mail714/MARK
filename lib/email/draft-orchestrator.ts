import { createAdminClient } from '@/lib/supabase/admin';
import { getCampaign, updateCampaign } from './campaigns';
import { listEmailImages, pickHeroImage } from './images';
import { getBrandInsights, insightsToPromptBlock } from './insights';
import { draftEmail } from '@/lib/ai/draft-email';
import { getTemplate } from './templates';
import { paletteForBrand } from './templates/brand-palettes';
import type { Brand } from '@/lib/types';

export async function draftCampaignCopy(campaignId: string): Promise<void> {
  const cs = await getCampaign(campaignId);
  if (!cs) throw new Error(`Campaign ${campaignId} not found`);

  const supabase = createAdminClient();

  // Brand name + website + slug drive the prompt context and the palette pick.
  let brandName: string | null = null;
  let brandWebsite: string | null = null;
  let brandSlug: string | null = null;
  if (cs.brand_id) {
    const { data: brand } = await supabase
      .from('brands')
      .select('name, website_url, slug')
      .eq('id', cs.brand_id)
      .maybeSingle();
    if (brand) {
      const b = brand as Pick<Brand, 'name' | 'website_url' | 'slug'>;
      brandName = b.name;
      brandWebsite = b.website_url;
      brandSlug = b.slug;
    }
  }

  // Audience description for the prompt.
  let audienceDescription = '';
  if (cs.address_book_ids.length > 0) {
    const { data: books } = await supabase
      .from('address_books')
      .select('name, contact_count')
      .in('dotdigital_id', cs.address_book_ids);
    if (books && books.length > 0) {
      const total = books.reduce(
        (n, r) => n + ((r as { contact_count: number | null }).contact_count ?? 0),
        0,
      );
      const names = books
        .map((b) => (b as { name: string }).name)
        .join(', ');
      audienceDescription = `${names} (${total.toLocaleString('en-GB')} contacts in total)`;
    }
  }

  // Hero image — operator pick or auto-fall back.
  let heroUrl = cs.hero_image_url;
  let heroAlt = cs.hero_image_alt;
  if (!heroUrl) {
    const pick = await pickHeroImage({ brandId: cs.brand_id, sector: cs.sector });
    if (pick) {
      heroUrl = pick.url;
      heroAlt = pick.alt;
      await updateCampaign(campaignId, {
        hero_image_url: pick.url,
        hero_image_alt: pick.alt,
      });
    }
  }

  // Image library — pull a brand-scoped subset so the AI can reference URLs
  // verbatim when picking per-section images. Sector-scoped first, then any
  // for the brand, capped to keep prompt tokens reasonable.
  const libByBrandSector = await listEmailImages({
    brandId: cs.brand_id,
    sector: cs.sector,
    pageSize: 30,
  });
  const libByBrand = await listEmailImages({
    brandId: cs.brand_id,
    pageSize: 40,
  });
  const seen = new Set<string>();
  const libraryImages: { url: string; altText: string | null; sector: string | null }[] = [];
  for (const img of [...libByBrandSector.items, ...libByBrand.items]) {
    if (seen.has(img.url)) continue;
    seen.add(img.url);
    libraryImages.push({ url: img.url, altText: img.alt_text, sector: img.sector });
    if (libraryImages.length >= 50) break;
  }

  const template = getTemplate(cs.template_key);
  const palette = paletteForBrand(brandSlug);

  // Past performance digest seeded from email_campaign_stats. Sector-specific
  // when we have one set; otherwise brand-wide. Silently no-ops when stats
  // are missing — the prompt builder skips the block in that case.
  let pastPerformance: string | null = null;
  if (cs.brand_id) {
    try {
      const insights = await getBrandInsights(cs.brand_id, cs.sector);
      if (insights.campaignsCount > 0) {
        pastPerformance = insightsToPromptBlock(insights);
      }
    } catch {
      // Don't let a stats outage block drafting — fall through with null.
      pastPerformance = null;
    }
  }

  try {
    const result = await draftEmail(
      {
        brandName,
        brandWebsite,
        sector: cs.sector,
        campaignType: cs.campaign_type,
        intent: cs.intent,
        audienceDescription,
        heroImageUrl: heroUrl,
        heroImageAlt: heroAlt,
        libraryImages,
        pastPerformance,
        campaignId: cs.id,
      },
      template,
    );

    const fields = template.extractFields(result.toolInput, {
      brandName: brandName ?? 'Signet',
      brandWebsite: brandWebsite ?? 'https://www.signetsigns.co.uk',
      brandPalette: palette,
      heroImageUrl: heroUrl,
      heroImageAlt: heroAlt,
    });

    fields.html_body = ensureUtmOnEveryLink(fields.html_body, {
      campaignId: cs.id,
      campaignType: cs.campaign_type ?? 'newsletter',
    });

    await updateCampaign(campaignId, {
      subject: fields.subject,
      preheader: fields.preheader,
      html_body: fields.html_body,
    });
    await supabase.from('email_campaigns').update({ last_error: null }).eq('id', campaignId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('email_campaigns')
      .update({ last_error: `Draft failed: ${message}` })
      .eq('id', campaignId);
    throw err;
  }
}


// Belt-and-braces: walk every <a href> and make sure it has the four UTM
// params. The drafter is told to add them but a server-side check keeps
// the link-clicks report honest even when the model misses one.
function ensureUtmOnEveryLink(
  html: string,
  args: { campaignId: string; campaignType: string },
): string {
  const required = {
    utm_source: 'email',
    utm_medium: args.campaignType,
    utm_campaign: args.campaignId,
  };
  return html.replace(/<a\b([^>]*?)href=(["'])([^"']+)\2/gi, (_full, pre, quote, url) => {
    const tagged = stampUtm(url, required);
    return `<a${pre}href=${quote}${tagged}${quote}`;
  });
}

function stampUtm(
  url: string,
  required: { utm_source: string; utm_medium: string; utm_campaign: string },
): string {
  // mailto: / tel: / # / unsubscribe placeholders — leave alone.
  if (/^(mailto:|tel:|#)/i.test(url)) return url;
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(required)) {
      if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    }
    // Stamp a fallback utm_content only if the drafter forgot one entirely.
    if (!u.searchParams.has('utm_content')) u.searchParams.set('utm_content', 'unlabelled');
    return u.toString();
  } catch {
    return url;
  }
}
