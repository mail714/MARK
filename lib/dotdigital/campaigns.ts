import { dotdigital } from './client';

export type CreateCampaignParams = {
  name: string;
  subject: string;
  fromName: string;
  fromAddressId: number;
  htmlContent: string;
  plainTextContent: string;
};

type DotdigitalCampaign = {
  id: number;
  name: string;
  subject: string;
  status?: string;
};

// Creates a dotdigital campaign in draft state. The user does the final
// review + audience selection + scheduling inside the dotdigital UI; MARK
// never sends directly. Returns the campaign id we save back on the row.
export async function createDotdigitalCampaign(
  params: CreateCampaignParams,
): Promise<DotdigitalCampaign> {
  return await dotdigital.post<DotdigitalCampaign>('/v2/campaigns', {
    name: params.name,
    subject: params.subject,
    fromName: params.fromName,
    fromAddress: { id: params.fromAddressId },
    htmlContent: params.htmlContent,
    plainTextContent: params.plainTextContent,
    isHtml: true,
    replyAction: 'Webhook',
  });
}
