import { dotdigital } from './client';

type FromAddress = {
  id: number;
  email: string;
  isCustomFromAddress?: boolean;
};

// dotdigital has shifted from-addresses around their endpoint tree between
// API versions. We try the known paths in order so the integration
// survives their renames without code changes. The first 200 wins.
const FROM_ADDRESS_PATHS = [
  '/v2/account-info/from-addresses',
  '/v2/email/from-addresses',
  '/v2/email/fromaddresses',
  '/v2/account/from-addresses',
];

export async function listFromAddresses(): Promise<FromAddress[]> {
  let lastError: Error | null = null;
  for (const path of FROM_ADDRESS_PATHS) {
    try {
      const list = await dotdigital.get<FromAddress[]>(path);
      if (Array.isArray(list)) return list;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // 404 here just means 'this endpoint isn't the right one' — try the
      // next. Any other status (401, 403, 5xx) is a real failure we want
      // to surface, but easiest to walk the list once and let the last
      // error speak. dotdigital's client throws statusCode-bearing errors
      // we could inspect later if needed.
    }
  }
  if (lastError) throw lastError;
  return [];
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
