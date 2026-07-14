import { searchGoogleViaScrapingBee, type GoogleSearchResult } from '@/lib/scrapingbee/client';
import { extractEmailsFromHtml, normaliseWebsiteUrl } from './website-scrape';

// Given only a business name + postcode, work Google for BOTH an email
// and (when the prospect has none) the company's own website:
//
//   query 1: '"Business Name" <postcode> email'
//   query 2 (only if q1 gave nothing relevant): 'Business Name <postcode>
//            website contact' — unquoted, aimed at surfacing the site
//
// From the combined results we:
//   1. pick the business's own website — the best-matching result whose
//      host isn't a directory / social / gov listing
//   2. harvest emails from result snippets (already relevance-checked)
//   3. fetch the own website + top relevant pages and extract from them
//   4. as a last inference, derive the website from a found email's
//      domain (info@acme.co.uk → acme.co.uk) when it isn't freemail
//
// Trust ladder for emails, most to least certain: own-domain match,
// snippet of a result that clearly mentions the business, then emails on
// fetched pages that tie back to the business by domain. Everything still
// goes through ZeroBounce before it can reach dotdigital.

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

// Hosts that can never be "the business's website" — directories, socials,
// registries, review sites, job boards. A SERP hit on one of these can
// still carry the email in its snippet; it just isn't the site.
const DIRECTORY_HOST_PATTERNS: RegExp[] = [
  /(^|\.)yell\.com$/,
  /(^|\.)cylex(-uk)?\.co\.uk$/,
  /(^|\.)thomsonlocal\.com$/,
  /(^|\.)checkatrade\.com$/,
  /(^|\.)trustpilot\.com$/,
  /(^|\.)bark\.com$/,
  /(^|\.)freeindex\.co\.uk$/,
  /(^|\.)hotfrog\.co\.uk$/,
  /(^|\.)misterwhat\.co\.uk$/,
  /(^|\.)scoot\.co\.uk$/,
  /(^|\.)opendi\.co\.uk$/,
  /(^|\.)yelp(\.co)?\.(com|uk)$/,
  /(^|\.)facebook\.com$/,
  /(^|\.)instagram\.com$/,
  /(^|\.)linkedin\.com$/,
  /(^|\.)(twitter|x)\.com$/,
  /(^|\.)tiktok\.com$/,
  /(^|\.)youtube\.com$/,
  /(^|\.)pinterest\.(com|co\.uk)$/,
  /(^|\.)google\.(com|co\.uk)$/,
  /(^|\.)wikipedia\.org$/,
  /(^|\.)gov\.uk$/,
  /(^|\.)companieshouse\.gov\.uk$/,
  /(^|\.)endole\.co\.uk$/,
  /(^|\.)companycheck\.co\.uk$/,
  /(^|\.)company-information\.service\.gov\.uk$/,
  /(^|\.)indeed\.(com|co\.uk)$/,
  /(^|\.)glassdoor\.(com|co\.uk)$/,
  /(^|\.)mybuilder\.com$/,
  /(^|\.)ratedpeople\.com$/,
  /(^|\.)houzz\.(com|co\.uk)$/,
  /(^|\.)192\.com$/,
  /(^|\.)ukbusinessdirectory\.co\.uk$/,
  /(^|\.)threebestrated\.co\.uk$/,
];

// Freemail domains can be the business's EMAIL, but never imply a website.
const FREEMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk',
  'outlook.com', 'outlook.co.uk', 'live.com', 'live.co.uk', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com',
  'aol.com', 'aol.co.uk', 'btinternet.com', 'btconnect.com',
  'sky.com', 'talktalk.net', 'virginmedia.com', 'ntlworld.com',
  'blueyonder.co.uk', 'protonmail.com', 'proton.me',
]);

// Hosts that block plain fetches (login walls) — their snippet may still
// contain the email but fetching the page is wasted time.
const UNFETCHABLE_HOSTS = /facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|tiktok\.com/i;

const NAME_STOPWORDS = new Set([
  'ltd', 'limited', 'llp', 'plc', 'the', 'and', 'co', 'uk', 'of', 'group',
  'services', 'service', 'company',
]);

// Trailing legal suffixes that hurt exact-phrase queries ('Bronev Lifts
// Ltd' — directories often list it without the Ltd).
const NAME_SUFFIX_RE = /\s+(ltd\.?|limited|llp|plc|co\.?|company)\s*$/i;

function cleanBusinessName(name: string): string {
  return name.replace(NAME_SUFFIX_RE, '').trim() || name.trim();
}

function significantTokens(businessName: string): string[] {
  return businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
}

function mentionsBusiness(text: string, tokens: string[], fullName: string): boolean {
  const hay = text.toLowerCase();
  // Exact phrase always counts, even for names the token heuristic
  // struggles with ('The Sign Co').
  if (fullName && hay.includes(fullName.toLowerCase())) return true;
  if (tokens.length === 0) return false;
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

function isDirectoryHost(host: string): boolean {
  return DIRECTORY_HOST_PATTERNS.some((re) => re.test(host));
}

// Pick the result most likely to be the business's own site: prefer a
// host containing a name token, then the highest-ranked relevant result
// that isn't a directory/social/registry. Returns the homepage-ish URL.
function pickOwnWebsite(
  relevant: GoogleSearchResult[],
  tokens: string[],
): string | null {
  const candidates = relevant.filter((r) => {
    const host = hostOf(r.url);
    return host && !isDirectoryHost(host);
  });
  if (candidates.length === 0) return null;
  const tokenMatch = candidates.find((r) =>
    tokens.some((t) => hostOf(r.url).replace(/[^a-z0-9]/g, '').includes(t)),
  );
  const chosen = tokenMatch ?? candidates[0];
  try {
    const u = new URL(chosen.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export type EmailHuntResult = {
  emails: string[];
  // The business's own website when we could identify one — callers save
  // this onto prospects that have no website yet.
  website: string | null;
  queries: string[];
  source: 'snippet' | 'page' | 'email-domain' | null;
};

export async function huntEmailsViaGoogle(args: {
  businessName: string;
  locationHint?: string | null; // postcode or town — narrows the SERP
  websiteDomain?: string | null; // prospect's own domain, if already known
}): Promise<EmailHuntResult> {
  const hint = args.locationHint?.trim() ?? '';
  const clean = cleanBusinessName(args.businessName);
  const tokens = significantTokens(args.businessName);
  const ownDomain = args.websiteDomain?.replace(/^www\./, '').toLowerCase() ?? null;
  const queries: string[] = [];

  const runQuery = async (q: string): Promise<GoogleSearchResult[]> => {
    queries.push(q);
    return await searchGoogleViaScrapingBee(q);
  };

  const relevantOf = (results: GoogleSearchResult[]) =>
    results.filter(
      (r) =>
        mentionsBusiness(`${r.title} ${r.description}`, tokens, clean) ||
        (ownDomain && hostOf(r.url) === ownDomain),
    );

  // Query 1 — aimed straight at the email.
  let relevant = relevantOf(
    await runQuery(`"${clean}" ${hint} email`.replace(/\s+/g, ' ').trim()),
  );

  // Query 2 — only when the first came back empty of anything usable.
  // Unquoted and aimed at the website instead, which is often enough:
  // once we have the site we can scrape the email off it for free.
  if (relevant.length === 0) {
    relevant = relevantOf(
      await runQuery(`${clean} ${hint} website contact`.replace(/\s+/g, ' ').trim()),
    );
  }
  if (relevant.length === 0) {
    return { emails: [], website: null, queries, source: null };
  }

  const foundWebsite = ownDomain ? null : pickOwnWebsite(relevant, tokens);
  const foundHost = foundWebsite ? hostOf(foundWebsite) : null;

  const rank = (emails: Iterable<string>): string[] => {
    const own: string[] = [];
    const rest: string[] = [];
    for (const e of emails) {
      const dom = emailDomain(e);
      if (!dom || JUNK_EMAIL_DOMAINS.has(dom)) continue;
      if ((ownDomain && dom === ownDomain) || (foundHost && dom === foundHost)) own.push(e);
      else rest.push(e);
    }
    return [...new Set([...own, ...rest])];
  };

  // Pass 1: the snippets themselves — free, and each snippet has already
  // been relevance-checked against the business name.
  const snippetEmails = rank(
    extractEmailsFromHtml(relevant.map((r) => `${r.title}\n${r.description}`).join('\n')),
  );
  if (snippetEmails.length > 0) {
    return { emails: snippetEmails.slice(0, 3), website: foundWebsite, queries, source: 'snippet' };
  }

  // Pass 2: fetch pages, own website first — it's the most likely to
  // carry the email and its emails need no extra tie-back checks.
  const fetchOrder = [
    ...(foundWebsite ? [foundWebsite] : []),
    ...relevant.map((r) => r.url).filter((u) => hostOf(u) !== foundHost),
  ].slice(0, 5);

  for (const url of fetchOrder) {
    if (UNFETCHABLE_HOSTS.test(url)) continue;
    let html: string;
    try {
      const res = await fetch(normaliseWebsiteUrl(url) ?? url, {
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
    const pageHost = hostOf(url);
    // A directory page lists other businesses' emails too, so page-sourced
    // emails must tie back to this business: the page being the business's
    // own site, an own-domain match, or a name token in the email domain.
    const pageIsOwnSite =
      (ownDomain && pageHost === ownDomain) ||
      (foundHost && pageHost === foundHost) ||
      tokens.some((t) => pageHost.replace(/[^a-z0-9]/g, '').includes(t));
    const pageEmails = rank(extractEmailsFromHtml(html)).filter((e) => {
      if (pageIsOwnSite) return true;
      const dom = emailDomain(e);
      if (ownDomain && dom === ownDomain) return true;
      if (foundHost && dom === foundHost) return true;
      return tokens.some((t) => dom.includes(t));
    });
    if (pageEmails.length > 0) {
      return { emails: pageEmails.slice(0, 3), website: foundWebsite, queries, source: 'page' };
    }
  }

  // Pass 3: no email anywhere, but maybe an email seen in ANY relevant
  // snippet implies the website (info@acme.co.uk → acme.co.uk). Only
  // non-freemail domains qualify, and only when we found no site already.
  if (!foundWebsite) {
    const anySnippetEmail = [...extractEmailsFromHtml(
      relevant.map((r) => `${r.title}\n${r.description}`).join('\n'),
    )].find((e) => {
      const dom = emailDomain(e);
      return dom && !JUNK_EMAIL_DOMAINS.has(dom) && !FREEMAIL_DOMAINS.has(dom);
    });
    if (anySnippetEmail) {
      return {
        emails: [],
        website: `https://${emailDomain(anySnippetEmail)}`,
        queries,
        source: 'email-domain',
      };
    }
  }

  return { emails: [], website: foundWebsite, queries, source: foundWebsite ? 'page' : null };
}
