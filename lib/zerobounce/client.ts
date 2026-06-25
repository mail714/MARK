// ZeroBounce email verification API. Used to check whether an email is
// actually deliverable before pushing it to dotdigital — protects sender
// reputation by removing dead addresses BEFORE they bounce on a campaign.
//
// Free tier: 100 credits / month. Paid from $15 for 2000 credits.
// Each verification is one credit regardless of result.

const SINGLE_URL = 'https://api.zerobounce.net/v2/validate';
const BATCH_URL = 'https://bulkapi.zerobounce.net/v2/validatebatch';
const CREDITS_URL = 'https://api.zerobounce.net/v2/getcredits';

export type EmailStatus =
  | 'valid'
  | 'invalid'
  | 'catch-all'
  | 'unknown'
  | 'spamtrap'
  | 'abuse'
  | 'do_not_mail';

export class ZeroBounceError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

function apiKey(): string {
  const k = process.env.ZEROBOUNCE_API_KEY;
  if (!k || !k.trim()) {
    throw new ZeroBounceError('ZEROBOUNCE_API_KEY is not set', 0);
  }
  return k.trim();
}

export function isZeroBounceConfigured(): boolean {
  const k = process.env.ZEROBOUNCE_API_KEY;
  return !!k && k.trim().length > 0;
}

// Verifications considered safe to push to dotdigital. 'unknown' is a
// borderline case — typically a server didn't respond cleanly — and we
// include it conservatively (better to send than discard a real address).
// Operator can override per-prospect.
const PUSHABLE_STATUSES = new Set<EmailStatus>(['valid', 'catch-all', 'unknown']);

export function isPushable(status: EmailStatus | null | undefined): boolean {
  return !!status && PUSHABLE_STATUSES.has(status);
}

export async function getCreditsRemaining(): Promise<number> {
  const url = new URL(CREDITS_URL);
  url.searchParams.set('api_key', apiKey());
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    throw new ZeroBounceError(`getCredits HTTP ${res.status}`, res.status);
  }
  const data = (await res.json()) as { Credits: string };
  const n = parseInt(data.Credits, 10);
  return Number.isFinite(n) ? n : 0;
}

type SingleResponse = {
  address: string;
  status: EmailStatus;
  sub_status?: string;
  did_you_mean?: string;
};

export async function verifyEmail(email: string): Promise<EmailStatus> {
  const url = new URL(SINGLE_URL);
  url.searchParams.set('api_key', apiKey());
  url.searchParams.set('email', email);
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ZeroBounceError(
      `ZeroBounce ${res.status}: ${body.slice(0, 200)}`,
      res.status,
    );
  }
  const data = (await res.json()) as SingleResponse;
  return data.status ?? 'unknown';
}

type BatchResponse = {
  email_batch: Array<{
    address: string;
    status: EmailStatus;
    sub_status?: string;
  }>;
};

// Validates up to 100 emails per request. Caller chunks if more.
export async function verifyEmailsBatch(
  emails: string[],
): Promise<Map<string, EmailStatus>> {
  const out = new Map<string, EmailStatus>();
  if (emails.length === 0) return out;
  const BATCH = 100;
  for (let i = 0; i < emails.length; i += BATCH) {
    const chunk = emails.slice(i, i + BATCH);
    const res = await fetch(BATCH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey(),
        email_batch: chunk.map((e) => ({ email_address: e })),
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ZeroBounceError(
        `ZeroBounce batch ${res.status}: ${body.slice(0, 200)}`,
        res.status,
      );
    }
    const data = (await res.json()) as BatchResponse;
    for (const r of data.email_batch ?? []) {
      out.set(r.address.toLowerCase(), r.status ?? 'unknown');
    }
  }
  return out;
}
