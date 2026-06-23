import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCampaign } from '@/lib/email/campaigns';
import { getAddressBooks } from '@/lib/email/address-books';
import { listBrands } from '@/lib/brands';
import { getCampaignStats } from '@/lib/email/stats';
import { getCampaignLinks } from '@/lib/email/link-clicks';
import { getBrandInsights } from '@/lib/email/insights';
import { CampaignBriefForm } from '@/components/email/CampaignBriefForm';
import { CampaignStatsPanel } from '@/components/email/CampaignStatsPanel';
import { DraftEmailButton } from '@/components/email/DraftEmailButton';
import { EditableCampaignField } from '@/components/email/EditableCampaignField';
import { EmailPreview } from '@/components/email/EmailPreview';
import { GenerateSocialButton } from '@/components/email/GenerateSocialButton';
import { HeroImagePicker } from '@/components/email/HeroImagePicker';
import { InsightsPanel } from '@/components/email/InsightsPanel';
import { LinkClicksPanel } from '@/components/email/LinkClicksPanel';
import { PreflightPanel } from '@/components/email/PreflightPanel';
import { PushButton } from '@/components/email/PushButton';
import { RefreshStatsButton } from '@/components/email/RefreshStatsButton';
import { canPush, runPreflight } from '@/lib/email/preflight';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  approved: { label: 'Approved', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  pushed: { label: 'Pushed', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  failed: { label: 'Failed', tone: 'bg-red-50 text-red-700 ring-red-200' },
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [campaign, books, brands, stats, links] = await Promise.all([
    getCampaign(id),
    getAddressBooks(),
    listBrands(),
    getCampaignStats(id),
    getCampaignLinks(id),
  ]);
  if (!campaign) notFound();

  // Pull insights for the brand+sector so the panel reflects what the drafter
  // sees. Swallow errors — it's secondary and should never block the page.
  const insights = campaign.brand_id
    ? await getBrandInsights(campaign.brand_id, campaign.sector).catch(() => null)
    : null;

  const status = STATUS_LABEL[campaign.status] ?? STATUS_LABEL.draft;
  const brandsBare = brands.map((b) => ({ id: b.id, slug: b.slug, name: b.name }));
  const booksBare = books.map((b) => ({
    dotdigital_id: b.dotdigital_id,
    name: b.name,
    contact_count: b.contact_count,
  }));

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div>
          <Link href="/emails/campaigns" className="text-xs text-neutral-500 hover:text-neutral-700">
            ← All campaigns
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {campaign.internal_name ?? campaign.subject ?? '(untitled)'}
            </h1>
            {campaign.subject ? (
              <p className="mt-1 text-sm text-neutral-600">{campaign.subject}</p>
            ) : null}
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ${status.tone}`}
          >
            {status.label}
          </span>
        </div>
        {campaign.last_error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-mono text-red-800">
            {campaign.last_error}
          </div>
        ) : null}
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Brief</h2>
        <p className="text-xs text-neutral-500">
          Choose the brand, the sector, the campaign type and the audience books, and write a short
          brief of what the email should cover. The AI drafter reads all of this.
        </p>
        <CampaignBriefForm
          campaignId={campaign.id}
          brands={brandsBare}
          addressBooks={booksBare}
          initial={{
            internal_name: campaign.internal_name,
            brand_id: campaign.brand_id,
            sector: campaign.sector,
            campaign_type: campaign.campaign_type,
            intent: campaign.intent,
            address_book_ids: campaign.address_book_ids,
            template_key: campaign.template_key,
            planned_send_at: campaign.planned_send_at,
          }}
        />
        <HeroImagePicker
          campaignId={campaign.id}
          selectedUrl={campaign.hero_image_url}
          selectedAlt={campaign.hero_image_alt}
          defaultSector={campaign.sector}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            Insights
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            What the drafter sees about past performance for this brand
            {campaign.sector ? ` and sector "${campaign.sector}"` : ''}.
            Set the brand and sector above to populate.
          </p>
        </div>
        <InsightsPanel insights={insights} />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Drafted copy
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Subject and preheader sit at the top of the inbox. Body is editable HTML —
              preview renders to the right.
            </p>
          </div>
          <DraftEmailButton campaignId={campaign.id} hasDraft={!!campaign.html_body} />
        </div>

        <div className="grid gap-4" key={`copy-${campaign.updated_at}`}>
          <EditableCampaignField
            campaignId={campaign.id}
            field="subject"
            label="Subject line"
            initialValue={campaign.subject}
            helper="30–60 chars"
            placeholder="The subject line readers see in their inbox"
          />
          <EditableCampaignField
            campaignId={campaign.id}
            field="preheader"
            label="Preheader"
            initialValue={campaign.preheader}
            helper="80–110 chars — preview text under the subject"
            placeholder="Short preview text — continues the subject, doesn't repeat it"
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <EditableCampaignField
              campaignId={campaign.id}
              field="html_body"
              label="HTML body"
              initialValue={campaign.html_body}
              multiline
              rows={20}
              helper="Inline styles — email-safe markup"
              placeholder="<p style=…>…</p>"
            />
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                Preview
              </div>
              <EmailPreview html={campaign.html_body} />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Push to dotdigital
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Pre-flight runs subject / preheader / body / spam / audience
              checks. Once everything&apos;s green or amber, pushing creates a
              draft campaign in dotdigital where you do final review and
              schedule the send.
            </p>
          </div>
          <PushButton
            campaignId={campaign.id}
            canPush={canPush(runPreflight(campaign))}
            status={campaign.status}
            dotdigitalCampaignId={campaign.dotdigital_campaign_id}
          />
        </div>
        <PreflightPanel checks={runPreflight(campaign)} />
      </section>

      {campaign.dotdigital_campaign_id ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                Reporting
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                Pulled from dotdigital after the campaign sends. Opens and click rates are
                shown over delivered (sent minus bounced).
              </p>
            </div>
            <RefreshStatsButton campaignId={campaign.id} />
          </div>
          <CampaignStatsPanel stats={stats} />
          <div className="pt-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Link clicks
            </h3>
            <p className="mt-0.5 text-[10px] text-neutral-500">
              Which links readers actually tapped, ranked by unique clickers.
              &quot;% of openers&quot; tells you the click-through rate per link.
            </p>
            <div className="mt-2">
              <LinkClicksPanel links={links} uniqueOpens={stats?.num_unique_opens ?? null} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
              Social variants
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Fan this campaign out into one draft post per platform configured for the brand.
              Drafts land in <Link href="/social" className="underline">Social</Link> for review and scheduling.
            </p>
          </div>
          <GenerateSocialButton campaignId={campaign.id} />
        </div>
      </section>
    </div>
  );
}
