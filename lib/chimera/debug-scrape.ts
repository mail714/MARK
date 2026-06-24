import {
  extractAddressFromHtml,
  extractEmailsFromHtml,
  fetchPageWithSource,
  findContactLinks,
  type FetchSource,
} from './website-scrape';
import { isScrapingBeeConfigured } from '@/lib/scrapingbee/client';

export type DebugFetchResult = {
  url: string;
  source: FetchSource;
  htmlBytes: number | null;
  htmlSnippet: string;
  emailsFound: string[];
  postcodeFound: string | null;
  expectedEmailInHtml: boolean | null;
  expectedEmailObfuscatedInHtml: boolean | null;
  directError: string | null;
  scrapingBeeError: string | null;
};

export type DebugScrapeResult = {
  websiteUrl: string;
  expectedEmail: string | null;
  scrapingBeeAvailable: boolean;
  homepage: DebugFetchResult;
  contactCandidates: string[];
  contactPagesTried: DebugFetchResult[];
  finalEmails: string[];
  finalPostcode: string | null;
};

async function fetchDebug(url: string, expected: string | null): Promise<DebugFetchResult> {
  const result: DebugFetchResult = {
    url,
    source: 'failed',
    htmlBytes: null,
    htmlSnippet: '',
    emailsFound: [],
    postcodeFound: null,
    expectedEmailInHtml: expected ? false : null,
    expectedEmailObfuscatedInHtml: expected ? false : null,
    directError: null,
    scrapingBeeError: null,
  };
  // Use the shared fetcher so the diagnostic exercises exactly what
  // production uses — direct first, ScrapingBee fallback on failure.
  const fetched = await fetchPageWithSource(url);
  result.source = fetched.source;
  result.directError = fetched.directError;
  result.scrapingBeeError = fetched.scrapingBeeError;
  if (fetched.html) {
    const html = fetched.html;
    result.htmlBytes = html.length;
    result.htmlSnippet = html.slice(0, 500);
    result.emailsFound = [...extractEmailsFromHtml(html)];
    result.postcodeFound = extractAddressFromHtml(html).postcode;

    if (expected) {
      const wanted = expected.toLowerCase();
      const haystack = html.toLowerCase();
      result.expectedEmailInHtml = haystack.includes(wanted);
      const local = wanted.split('@')[0];
      const domain = wanted.split('@')[1] ?? '';
      const obfuscatedPatterns = [
        `${local}&#64;${domain}`,
        `${local}&commat;${domain}`,
        `${local} [at] ${domain}`,
        `${local}[at]${domain}`,
        `${local} (at) ${domain}`,
        `${local} at ${domain}`,
      ].map((s) => s.toLowerCase());
      result.expectedEmailObfuscatedInHtml = obfuscatedPatterns.some((p) =>
        haystack.includes(p),
      );
    }
  }
  return result;
}

export async function debugScrape(args: {
  websiteUrl: string;
  expectedEmail?: string | null;
}): Promise<DebugScrapeResult> {
  const result: DebugScrapeResult = {
    websiteUrl: args.websiteUrl,
    expectedEmail: args.expectedEmail ?? null,
    scrapingBeeAvailable: isScrapingBeeConfigured(),
    homepage: {} as DebugFetchResult,
    contactCandidates: [],
    contactPagesTried: [],
    finalEmails: [],
    finalPostcode: null,
  };

  // Homepage — runs through the shared fetcher (direct → ScrapingBee).
  result.homepage = await fetchDebug(args.websiteUrl, args.expectedEmail ?? null);

  const allEmails = new Set(result.homepage.emailsFound);
  let postcode = result.homepage.postcodeFound;

  // Parse nav for contact links. The homepage HTML is already in
  // result.homepage but we don't keep the full body, just the snippet —
  // re-fetch via the shared fetcher so the candidates come from whichever
  // path actually succeeded.
  if (result.homepage.htmlBytes && result.homepage.htmlBytes > 0) {
    const re = await fetchPageWithSource(args.websiteUrl);
    if (re.html) {
      result.contactCandidates = findContactLinks(re.html, args.websiteUrl);
    }
  }
  if (result.contactCandidates.length === 0) {
    try {
      const origin = new URL(args.websiteUrl).origin;
      result.contactCandidates = ['/contact', '/contact-us', '/about', '/find-us'].map(
        (p) => `${origin}${p}`,
      );
    } catch {
      // unparseable URL — leave candidates empty
    }
  }

  for (const url of result.contactCandidates.slice(0, 6)) {
    const r = await fetchDebug(url, args.expectedEmail ?? null);
    result.contactPagesTried.push(r);
    for (const e of r.emailsFound) allEmails.add(e);
    if (!postcode && r.postcodeFound) postcode = r.postcodeFound;
  }

  result.finalEmails = [...allEmails].sort();
  result.finalPostcode = postcode;
  return result;
}
