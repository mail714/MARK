import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type CardProps = {
  href: string;
  title: string;
  description: string;
  count?: number | null;
  countLabel?: string;
};

function Card({ href, title, description, count, countLabel }: CardProps) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-neutral-200 bg-white p-6 transition hover:border-neutral-400"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-lg font-medium tracking-tight">{title}</div>
        {count !== undefined && count !== null ? (
          <div className="text-xs text-neutral-500">
            {count} {countLabel}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-neutral-600">{description}</p>
    </Link>
  );
}

async function getCounts() {
  const supabase = createAdminClient();
  try {
    const [campaigns, books, images] = await Promise.all([
      supabase.from('email_campaigns').select('*', { count: 'exact', head: true }),
      supabase.from('address_books').select('*', { count: 'exact', head: true }),
      supabase.from('email_images').select('*', { count: 'exact', head: true }),
    ]);
    return {
      campaigns: campaigns.count ?? 0,
      addressBooks: books.count ?? 0,
      images: images.count ?? 0,
    };
  } catch {
    return { campaigns: null, addressBooks: null, images: null };
  }
}

export default async function EmailsPage() {
  const counts = await getCounts();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Emails</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Drafting, scheduling and reporting for campaigns sent through dotdigital.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          href="/emails/campaigns"
          title="Campaigns"
          description="Drafts authored in MARK. Pick a brand, audience, sector and brief, then have Claude write the subject and HTML body. Approved drafts get pushed to dotdigital ready to send."
          count={counts.campaigns}
          countLabel={counts.campaigns === 1 ? 'campaign' : 'campaigns'}
        />
        <Card
          href="/emails/address-books"
          title="Address books"
          description="Synced from dotdigital. Tag each book with a brand and a sector so the drafter knows who it's writing to."
          count={counts.addressBooks}
          countLabel={counts.addressBooks === 1 ? 'book' : 'books'}
        />
        <Card
          href="/emails/images"
          title="Image library"
          description="Marketing-grade hero shots sourced from the brand Wix sites. Browse by sector, then pick one for any campaign."
          count={counts.images}
          countLabel={counts.images === 1 ? 'image' : 'images'}
        />
        <Card
          href="/emails/reporting"
          title="Reporting"
          description="Per-campaign opens, clicks, unsubscribes and bounces from dotdigital with sector and brand breakdowns. Phase D."
        />
      </div>
    </div>
  );
}
