import { dotdigital } from './client';

type FromAddress = {
  id: number;
  email: string;
  isCustomFromAddress?: boolean;
};

// dotdigital requires every campaign to specify a from-address id. The
// operator picks which one to use centrally in the dotdigital admin; MARK
// just takes the first approved address. If they configure a different
// preferred address later we'll add brand-specific picking, but for now
// 'whatever dotdigital lists first' is fine because they only push from
// one shared marketing address anyway.
export async function listFromAddresses(): Promise<FromAddress[]> {
  const list = await dotdigital.get<FromAddress[]>('/v2/account-info/from-addresses');
  if (!Array.isArray(list)) return [];
  return list;
}

export async function getDefaultFromAddress(): Promise<FromAddress> {
  const list = await listFromAddresses();
  if (list.length === 0) {
    throw new Error(
      'No from-addresses set up in dotdigital. Add one in Settings → Account information → From addresses before pushing campaigns.',
    );
  }
  return list[0];
}
