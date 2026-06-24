import { createAdminClient } from '@/lib/supabase/admin';
import {
  ApolloError,
  fullName,
  isUsableEmail,
  searchPeopleByDomain,
  searchPeopleByOrganisationName,
  type ApolloPerson,
} from '@/lib/apollo/client';

export type ApolloContact = {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  email_status: string | null;
};

function projectPerson(p: ApolloPerson): ApolloContact {
  const email = isUsableEmail(p.email) ? p.email.toLowerCase() : null;
  const phone = p.phone_numbers?.[0]?.sanitized_number ?? p.phone_numbers?.[0]?.raw_number ?? null;
  return {
    name: fullName(p) || '(unknown)',
    title: p.title ?? null,
    email,
    phone,
    linkedin_url: p.linkedin_url ?? null,
    email_status: p.email_status ?? null,
  };
}

export type EnrichResult = {
  prospectsTried: number;
  contactsAdded: number;
  emailsAdded: number;
  errors: Array<{ prospectId: string; reason: string }>;
};

// Bulk-enriches prospects via Apollo. Looks up by website_domain when
// available, else by business_name (used for Companies House rows that
// have no domain). Already-enriched prospects are skipped unless force=true
// so re-runs don't burn Apollo credits unnecessarily.
export async function enrichProspectsWithApollo(args: {
  prospectIds: string[];
  perPage?: number;
  force?: boolean;
}): Promise<EnrichResult> {
  const supabase = createAdminClient();
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select(
      'id, business_name, website_domain, emails, apollo_contacts, apollo_enriched_at, source',
    )
    .in('id', args.prospectIds);
  if (error) throw new Error(`Failed to load prospects: ${error.message}`);

  const result: EnrichResult = {
    prospectsTried: 0,
    contactsAdded: 0,
    emailsAdded: 0,
    errors: [],
  };

  for (const p of (prospects ?? []) as Array<{
    id: string;
    business_name: string;
    website_domain: string | null;
    emails: string[];
    apollo_contacts: ApolloContact[];
    apollo_enriched_at: string | null;
    source: string;
  }>) {
    if (!args.force && p.apollo_enriched_at) {
      continue; // skip prospects already enriched
    }

    result.prospectsTried += 1;

    try {
      const people = p.website_domain
        ? await searchPeopleByDomain({ domain: p.website_domain, perPage: args.perPage })
        : await searchPeopleByOrganisationName({
            name: p.business_name,
            perPage: args.perPage,
          });
      const contacts = people.map(projectPerson);

      // Merge Apollo emails into the existing emails array, deduped.
      const apolloEmails = contacts
        .map((c) => c.email)
        .filter((e): e is string => !!e);
      const before = new Set(p.emails.map((e) => e.toLowerCase()));
      const merged = [...p.emails];
      let added = 0;
      for (const e of apolloEmails) {
        if (!before.has(e)) {
          merged.push(e);
          before.add(e);
          added += 1;
        }
      }

      await supabase
        .from('prospects')
        .update({
          emails: merged,
          apollo_contacts: contacts,
          apollo_enriched_at: new Date().toISOString(),
        })
        .eq('id', p.id);

      result.contactsAdded += contacts.length;
      result.emailsAdded += added;
    } catch (err) {
      const message =
        err instanceof ApolloError
          ? `Apollo ${err.statusCode}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      result.errors.push({ prospectId: p.id, reason: message });
      // Don't keep hammering if Apollo's out of credits or rate-limiting us.
      if (err instanceof ApolloError && (err.statusCode === 402 || err.statusCode === 429)) {
        break;
      }
    }
  }

  return result;
}
