import { createAdminClient } from '@/lib/supabase/admin';
import { dotdigital } from '@/lib/dotdigital/client';
import { listAllDataFieldNames } from '@/lib/dotdigital/data-fields';
import { rankPushableEmails } from './email-priority';
import type { EmailStatus } from '@/lib/zerobounce/client';

// Push approved prospects (with an email) into a specific dotdigital address
// book. dotdigital's /v2/address-books/{id}/contacts endpoint accepts a single
// contact at a time and returns the created/updated contact. We loop and
// collect successes vs failures so the operator sees both.

type DotdigitalContact = {
  email: string;
  optInType?: 'Single' | 'Double' | 'VerifiedDouble' | 'Unknown';
  emailType?: 'PlainText' | 'Html';
  dataFields?: Array<{ key: string; value: string }>;
};

async function pushOne(addressBookId: number, contact: DotdigitalContact): Promise<{ id: number }> {
  return await dotdigital.post<{ id: number }>(
    `/v2/address-books/${addressBookId}/contacts`,
    contact,
  );
}

export type PushResult = {
  pushed: number;
  failed: number;
  skipped: number;
  errors: Array<{ prospectId: string; reason: string }>;
};

export async function pushProspectsToBook(args: {
  prospectIds: string[];
  brandId: string;
  addressBookId: number;
}): Promise<PushResult> {
  const supabase = createAdminClient();
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, business_name, emails, phone, website, email_statuses')
    .in('id', args.prospectIds);
  if (error) throw new Error(`Failed to load prospects: ${error.message}`);

  // Only send data fields that actually exist on the dotdigital account —
  // otherwise the API rejects the whole contact with ERROR_CONTACT_INVALID.
  const availableFields = await listAllDataFieldNames();

  const out: PushResult = { pushed: 0, failed: 0, skipped: 0, errors: [] };
  const now = new Date().toISOString();

  for (const p of (prospects ?? []) as Array<{
    id: string;
    business_name: string;
    emails: string[];
    phone: string | null;
    website: string | null;
    email_statuses: Record<string, EmailStatus> | null;
  }>) {
    if (!p.emails || p.emails.length === 0) {
      out.skipped += 1;
      out.errors.push({ prospectId: p.id, reason: 'No email on prospect' });
      continue;
    }
    // Rank the verification-pushable emails best-first (valid generic
    // inboxes on top; invalid/spamtrap/do_not_mail excluded entirely).
    // We push the first and fall down the list only on suppression.
    const pushable = rankPushableEmails(p.emails, p.email_statuses);
    if (pushable.length === 0) {
      out.skipped += 1;
      out.errors.push({
        prospectId: p.id,
        reason: 'All emails marked unverifiable — run Verify emails or push manually',
      });
      continue;
    }
    const dataFields: Array<{ key: string; value: string }> = [];
    if (availableFields.has('FIRSTNAME')) {
      dataFields.push({ key: 'FIRSTNAME', value: p.business_name });
    }
    if (p.phone && availableFields.has('TELEPHONE')) {
      dataFields.push({ key: 'TELEPHONE', value: p.phone });
    }
    if (p.website && availableFields.has('WEBSITE')) {
      dataFields.push({ key: 'WEBSITE', value: p.website });
    }

    // dotdigital is one-contact-per-email. Try each pushable email in
    // order: if the account's suppression list rejects one (previously
    // unsubscribed / hard-bounced / complained), record that against the
    // email and fall through to the next rather than failing the prospect.
    const suppressed: string[] = [];
    let pushed = false;
    let failure: string | null = null;

    for (const email of pushable) {
      const contact: DotdigitalContact = {
        email,
        optInType: 'Single',
        emailType: 'Html',
        dataFields,
      };
      try {
        await pushOne(args.addressBookId, contact);
        pushed = true;
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/ERROR_CONTACT_SUPPRESSED|suppressed/i.test(message)) {
          suppressed.push(email.trim().toLowerCase());
          continue;
        }
        failure = message;
        break;
      }
    }

    if (suppressed.length > 0) {
      // Persist so the review UI shows the email as blocked and future
      // pushes skip it without another round-trip to dotdigital.
      const next: Record<string, EmailStatus> = { ...(p.email_statuses ?? {}) };
      for (const e of suppressed) next[e] = 'suppressed';
      await supabase.from('prospects').update({ email_statuses: next }).eq('id', p.id);
    }

    if (pushed) {
      await supabase
        .from('prospect_brand_assignments')
        .update({
          status: 'pushed',
          pushed_to_dotdigital_book_id: args.addressBookId,
          pushed_at: now,
        })
        .eq('prospect_id', p.id)
        .eq('brand_id', args.brandId);
      out.pushed += 1;
    } else if (failure) {
      out.failed += 1;
      out.errors.push({ prospectId: p.id, reason: failure });
    } else {
      out.skipped += 1;
      out.errors.push({
        prospectId: p.id,
        reason: 'Suppressed in dotdigital (previously unsubscribed or bounced)',
      });
    }
  }

  return out;
}
