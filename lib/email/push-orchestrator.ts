import { createAdminClient } from '@/lib/supabase/admin';
import { getCampaign } from './campaigns';
import { canPush, runPreflight } from './preflight';
import { createDotdigitalCampaign } from '@/lib/dotdigital/campaigns';
import { getDefaultFromAddress } from '@/lib/dotdigital/from-addresses';
import type { Brand } from '@/lib/types';

// Strip HTML to a sensible plain-text fallback. dotdigital will accept HTML
// only campaigns, but providing a plain text variant improves deliverability
// for clients without HTML support.
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();
}

export async function pushCampaignToDotdigital(
  campaignId: string,
): Promise<{ dotdigitalCampaignId: number }> {
  const cs = await getCampaign(campaignId);
  if (!cs) throw new Error(`Campaign ${campaignId} not found`);

  const checks = runPreflight(cs);
  if (!canPush(checks)) {
    const fails = checks
      .filter((c) => c.status === 'fail')
      .map((c) => `${c.label}: ${c.message}`)
      .join('; ');
    throw new Error(`Pre-flight blocked the push — ${fails}`);
  }

  const supabase = createAdminClient();

  let fromName = 'Signet';
  if (cs.brand_id) {
    const { data: brand } = await supabase
      .from('brands')
      .select('name')
      .eq('id', cs.brand_id)
      .maybeSingle();
    if (brand) fromName = (brand as Pick<Brand, 'name'>).name;
  }

  try {
    const fromAddress = await getDefaultFromAddress();
    const plainTextContent = htmlToPlainText(cs.html_body ?? '');
    const created = await createDotdigitalCampaign({
      name: cs.internal_name ?? cs.subject ?? 'Untitled campaign',
      subject: cs.subject ?? '',
      fromName,
      fromAddressId: fromAddress.id,
      htmlContent: cs.html_body ?? '',
      plainTextContent,
    });

    const { error } = await supabase
      .from('email_campaigns')
      .update({
        status: 'pushed',
        dotdigital_campaign_id: created.id,
        pushed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', campaignId);
    if (error) throw new Error(`Failed to save pushed state: ${error.message}`);

    return { dotdigitalCampaignId: created.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('email_campaigns')
      .update({ status: 'failed', last_error: `Push failed: ${message}` })
      .eq('id', campaignId);
    throw err;
  }
}
