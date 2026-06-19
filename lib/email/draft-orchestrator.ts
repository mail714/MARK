import { createAdminClient } from '@/lib/supabase/admin';
import { getCampaign, updateCampaign } from './campaigns';
import { pickHeroImage } from './images';
import { draftEmail } from '@/lib/ai/draft-email';
import type { Brand } from '@/lib/types';

export async function draftCampaignCopy(campaignId: string): Promise<void> {
  const cs = await getCampaign(campaignId);
  if (!cs) throw new Error(`Campaign ${campaignId} not found`);

  const supabase = createAdminClient();

  // Brand name + website provide brand voice context to the prompt.
  let brandName: string | null = null;
  let brandWebsite: string | null = null;
  if (cs.brand_id) {
    const { data: brand } = await supabase
      .from('brands')
      .select('name, website_url')
      .eq('id', cs.brand_id)
      .maybeSingle();
    if (brand) {
      const b = brand as Pick<Brand, 'name' | 'website_url'>;
      brandName = b.name;
      brandWebsite = b.website_url;
    }
  }

  // Look up the names of the selected address books so the model knows
  // who it's writing to.
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

  // Hero image: use the operator's pick, fall back to a best-fit from the
  // library based on brand + sector. Save the auto-pick back onto the row
  // so it shows up in the picker UI on next render.
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

  try {
    const fields = await draftEmail({
      brandName,
      brandWebsite,
      sector: cs.sector,
      campaignType: cs.campaign_type,
      intent: cs.intent,
      audienceDescription,
      heroImageUrl: heroUrl,
      heroImageAlt: heroAlt,
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
