import {
  extractAddressFromHtml,
  extractEmailsFromHtml,
  findContactLinks,
} from './website-scrape';

const REQUEST_TIMEOUT_MS = 15000;

// Browser-ish User-Agent. If a site is serving different content based on
// UA (e.g. Cloudflare bot challenge), we'll get a clearer picture by
// looking like a real Chrome rather than the production scraper's UA.
const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type DebugFetchResult = {
  url: string;
  finalUrl: string | null;
  status: number | null;
  contentType: string | null;
  htmlBytes: number | null;
  htmlSnippet: string;
  emailsFound: string[];
  postcodeFound: string | null;
  expectedEmailInHtml: boolean | null;
  expectedEmailObfuscatedInHtml: boolean | null;
  error: string | null;
};

export type DebugScrapeResult = {
  websiteUrl: string;
  expectedEmail: string | null;
  homepage: DebugFetchResult;
  contactCandidates: string[];
  contactPagesTried: DebugFetchResult[];
  finalEmails: string[];
  finalPostcode: string | null;
};

async function fetchDebug(url: string, expected: string | null): Promise<DebugFetchResult> {
  const result: DebugFetchResult = {
    url,
    finalUrl: null,
    status: null,
    contentType: null,
    htmlBytes: null,
    htmlSnippet: '',
    emailsFound: [],
    postcodeFound: null,
    expectedEmailInHtml: expected ? false : null,
    expectedEmailObfuscatedInHtml: expected ? false : null,
    error: null,
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA_BROWSER },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    result.status = res.status;
    result.finalUrl = res.url;
    result.contentType = res.headers.get('content-type');
    if (!res.ok) {
      result.error = `HTTP ${res.status}`;
      return result;
    }
    const html = await res.text();
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
  } catch (err) {
    result.error = describeFetchError(err);
  }
  return result;
}

// Node's fetch wraps every network failure as 'fetch failed' — the real
// reason lives in err.cause. Unpack a few common shapes (DNS, TLS, conn
// refused, undici errors) so the diagnostic page shows ENOTFOUND vs
// CERT_HAS_EXPIRED vs ECONNREFUSED rather than just 'fetch failed'.
function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const c = cause as { message?: string; code?: string; errno?: number; reason?: string };
    if (c.code) parts.push(`code=${c.code}`);
    if (c.errno) parts.push(`errno=${c.errno}`);
    if (c.message) parts.push(c.message);
    if (c.reason) parts.push(`reason=${c.reason}`);
  }
  if (err.name && err.name !== 'Error') parts.push(`name=${err.name}`);
  return parts.filter(Boolean).join(' · ');
}

export async function debugScrape(args: {
  websiteUrl: string;
  expectedEmail?: string | null;
}): Promise<DebugScrapeResult> {
  const result: DebugScrapeResult = {
    websiteUrl: args.websiteUrl,
    expectedEmail: args.expectedEmail ?? null,
    homepage: {} as DebugFetchResult,
    contactCandidates: [],
    contactPagesTried: [],
    finalEmails: [],
    finalPostcode: null,
  };

  // Homepage
  result.homepage = await fetchDebug(args.websiteUrl, args.expectedEmail ?? null);

  const allEmails = new Set(result.homepage.emailsFound);
  let postcode = result.homepage.postcodeFound;

  // Parse nav for contact links, fall back to hardcoded list if none.
  if (result.homepage.htmlBytes && result.homepage.htmlBytes > 0) {
    try {
      const res = await fetch(args.websiteUrl, {
        headers: { 'User-Agent': UA_BROWSER },
      });
      const html = await res.text();
      result.contactCandidates = findContactLinks(html, args.websiteUrl);
    } catch {
      result.contactCandidates = [];
    }
  }
  if (result.contactCandidates.length === 0) {
    const origin = new URL(args.websiteUrl).origin;
    result.contactCandidates = ['/contact', '/contact-us', '/about', '/find-us'].map(
      (p) => `${origin}${p}`,
    );
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
