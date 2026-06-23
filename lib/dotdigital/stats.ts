import { dotdigital } from './client';

// Shape returned by GET /v2/campaigns/{id}/summary. Fields are nullable on
// purpose — dotdigital omits some until the campaign has actually been sent.
export type DotdigitalCampaignSummary = {
  dateSent: string | null;
  numTotalSent: number | null;
  numTotalRecipients: number | null;
  numUniqueOpens: number | null;
  numTotalOpens: number | null;
  numUniqueClicks: number | null;
  numTotalClicks: number | null;
  numHardBounces: number | null;
  numSoftBounces: number | null;
  numUnsubscribes: number | null;
  numSpamComplaints: number | null;
  numForwards: number | null;
  numReplies: number | null;
  // dotdigital returns plenty more fields; we keep the raw payload too so
  // future code can read additional metrics without another schema change.
};

export async function getCampaignSummary(
  dotdigitalCampaignId: number,
): Promise<DotdigitalCampaignSummary & Record<string, unknown>> {
  return await dotdigital.get<DotdigitalCampaignSummary & Record<string, unknown>>(
    `/v2/campaigns/${dotdigitalCampaignId}/summary`,
  );
}
