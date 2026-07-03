// ZeroBounce email verification API. Used to check whether an email is
// actually deliverable before pushing it to dotdigital — protects sender
// reputation by removing dead addresses BEFORE they bounce on a campaign.
//
// Free tier: 100 credits / month. Paid from $15 for 2000 credits.
// Each verification is one credit regardless of result.

const SINGLE_URL = 'https://api.zerobounce.net/v2/validate';
const CREDITS_URL = 'https://api.zerobounce.net/v2/getcredits';

export type EmailStatus =
  | 'valid'
  | 'invalid'
  | 'catch-all'
  | 'unknown'
  | 'spamtrap'
  | 'abuse'
  | 'do_not_mail'
  // Not a ZeroBounce result — set by the dotdigital push when the account's
  // suppression list rejects a contact (previously unsubscribed / bounced /
  // complained). Kept in the same status map so filters exclude it.
  | 'suppressed';

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

// ZeroBounce's bulk endpoint (bulkapi.zerobounce.net) requires an
// enterprise-tier account. The single-validate endpoint works on any paid
// plan, so we call it in parallel to get equivalent throughput without
// the tier gate. Concurrency of 8 keeps well under ZeroBounce's default
// 1000-requests-per-minute limit.
const CONCURRENCY = 8;

export async function verifyEmailsBatch(
  emails: string[],
): Promise<Map<string, EmailStatus>> {
  const out = new Map<string, EmailStatus>();
  if (emails.length === 0) return out;

  let cursor = 0;
  let firstError: Error | null = null;

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, emails.length) },
    async () => {
      for (;;) {
        const idx = cursor++;
        if (idx >= emails.length) return;
        const email = emails[idx];
        try {
          const status = await verifyEmail(email);
          out.set(email.toLowerCase(), status);
        } catch (err) {
          // Capture the first failure but keep processing the rest — a
          // single bad email shouldn't abort the whole batch. Caller
          // surfaces the error message via the bulk-job progress card.
          if (!firstError) {
            firstError = err instanceof Error ? err : new Error(String(err));
          }
        }
      }
    },
  );
  await Promise.all(workers);

  if (firstError && out.size === 0) {
    // Every single request failed — usually means the key or endpoint is
    // wrong. Surface that clearly instead of silently returning an empty
    // map that looks like 'no emails were verifiable'.
    throw firstError;
  }
  return out;
}
