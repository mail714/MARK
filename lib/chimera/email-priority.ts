import { isPushable, type EmailStatus } from '@/lib/zerobounce/client';

// Picks the best address to push to dotdigital when a prospect has several.
// Two-level ranking:
//   1. Verification status — valid beats catch-all beats unknown beats
//      never-verified. A confirmed mailbox is always the safer send.
//   2. Within the same status, generic company inboxes (info@, sales@…)
//      beat personal/branch addresses — they're monitored, expected to
//      receive cold enquiries, and don't go stale when someone leaves.
// Pure module (no server deps) so the review UI can mirror the exact
// same choice the push makes.

const GENERIC_PREFIXES = new Set([
  'info',
  'sales',
  'enquiries',
  'enquiry',
  'contact',
  'hello',
  'office',
  'admin',
  'mail',
  'reception',
]);

function statusRank(status: EmailStatus | undefined): number {
  if (status === 'valid') return 0;
  if (status === 'catch-all') return 1;
  if (status === 'unknown') return 2;
  return 3; // never verified
}

function isGenericInbox(email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  return GENERIC_PREFIXES.has(local);
}

// Returns the prospect's pushable emails sorted best-first. The push sends
// the first entry and only moves down the list if dotdigital rejects it
// (e.g. suppressed). Sort is stable, so ties keep their scraped order.
export function rankPushableEmails(
  emails: string[],
  statuses: Record<string, EmailStatus> | null | undefined,
): string[] {
  const lookup = statuses ?? {};
  return emails
    .filter((e) => {
      const s = lookup[e.trim().toLowerCase()];
      // Unverified emails pass through so pushes still work when
      // ZeroBounce hasn't been run on this prospect.
      return !s || isPushable(s);
    })
    .map((e, i) => {
      const s = lookup[e.trim().toLowerCase()];
      return { e, i, score: statusRank(s) * 2 + (isGenericInbox(e) ? 0 : 1) };
    })
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((x) => x.e);
}
