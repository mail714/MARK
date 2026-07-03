import { searchGoogleViaScrapingBee } from '@/lib/scrapingbee/client';
import { extractEmailsFromHtml } from './website-scrape';

// Email hunt of last resort: Google '"Business Name" <location> email'.
// Directories (Yell, Cylex, Thomson Local), Facebook page snippets and
// cached contact pages routinely surface an address that the prospect's
// own website hides behind a form — or the prospect has no website at all.
//
// Trust ladder, most to least certain:
//   1. an email whose domain matches the prospect's known website
//   2. an email found in the snippet of a result that clearly mentions
//      the business
//   3. an email extracted from a fetched result page, but only when its
//      domain ties back to the business (own-domain or name token)
// Everything still goes through ZeroBounce before it can reach dotdigital,
// so a stale directory address gets caught as 'invalid' downstream.

// Platform/support addresses that show up in directory pages and are never
// the business's own contact.
const JUNK_EMAIL_DOMAINS = new Set([
  'yell.com',
  'cylex-uk.co.uk',
  'cylex.co.uk',
  'thomsonlocal.com',
  'checkatrade.com',
  'trustpilot.com',
  'bark.com',
  'freeindex.co.uk',
  'hotfrog.co.uk',
  'misterwhat.co.uk',
  'scoot.co.uk',
  'opendi.co.uk',
  'yelp.com',
  'yelp.co.uk',
  'facebook.com',
  'google.com',
  'example.com',
  'sentry.io',
  'wixpress.com',
  'squarespace.com',
  'wordpress.com',
]);

// Hosts that block plain fetches (login walls) — their snippet may still
// contain the email but fetching the page is wasted time.
const UNFETCHABLE_HOSTS = /facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|tiktok\.com/i;

const NAME_STOPWORDS = new Set([
  'ltd', 'limited', 'llp', 'plc', 'the', 'and', 'co', 'uk', 'of', 'group',
  'services', 'service', 'company',
]);

function significantTokens(businessName: string): string[] {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
}

function mentionsBusiness(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const hay = text.toLowerCase();
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits >= Math.ceil(tokens.length / 2);
}

function emailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? '';
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export type EmailHuntResult = {
  emails: string[];
  query: string;
  source: 'snippet' | 'page' | null;
};

export async function huntEmailsViaGoogle(args: {
  businessName: string;
  locationHint?: string | null; // postcode or town — narrows the SERP
  websiteDomain?: string | null; // prospect's own domain, if known
}): Promise<EmailHuntResult> {
  const hint = args.locationHint?.trim() ?? '';
  const query = `"${args.businessName}" ${hint} email`.replace(/\s+/g, ' ').trim();
  const tokens = significantTokens(args.businessName);
  const ownDomain = args.websiteDomain?.replace(/^www\./, '').toLowerCase() ?? null;

  const results = await searchGoogleViaScrapingBee(query);
  const relevant = results.filter(
    (r) =>
      mentionsBusiness(`${r.title} ${r.description}`, tokens) ||
      (ownDomain && hostOf(r.url) === ownDomain),
  );

  const rank = (emails: Iterable<string>): string[] => {
    const own: string[] = [];
    const rest: string[] = [];
    for (const e of emails) {
      const dom = emailDomain(e);
      if (!dom || JUNK_EMAIL_DOMAINS.has(dom)) continue;
      if (ownDomain && dom === ownDomain) own.push(e);
      else rest.push(e);
    }
    return [...new Set([...own, ...rest])];
  };

  // Pass 1: the snippets themselves — one API call, and each snippet has
  // already been relevance-checked against the business name.
  const snippetEmails = rank(
    extractEmailsFromHtml(relevant.map((r) => `${r.title}\n${r.description}`).join('\n')),
  );
  if (snippetEmails.length > 0) {
    return { emails: snippetEmails.slice(0, 3), query, source: 'snippet' };
  }

  // Pass 2: fetch the top relevant result pages directly. A directory page
  // lists other businesses' emails too, so page-sourced emails must tie
  // back to this business: own-domain match, a name token in the email's
  // domain, or the page itself being on the business's own site.
  for (const r of relevant.slice(0, 4)) {
    if (UNFETCHABLE_HOSTS.test(r.url)) continue;
    let html: string;
    try {
      const res = await fetch(r.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        },
        cache: 'no-store',
      });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }
    const pageHost = hostOf(r.url);
    const pageIsOwnSite =
      (ownDomain && pageHost === ownDomain) || tokens.some((t) => pageHost.includes(t));
    const pageEmails = rank(extractEmailsFromHtml(html)).filter((e) => {
      if (pageIsOwnSite) return true;
      const dom = emailDomain(e);
      if (ownDomain && dom === ownDomain) return true;
      return tokens.some((t) => dom.includes(t));
    });
    if (pageEmails.length > 0) {
      return { emails: pageEmails.slice(0, 3), query, source: 'page' };
    }
  }

  return { emails: [], query, source: null };
}
