// Ported from Chimera's email + address scraper. Regex-based parsing — no
// HTML library dependency. Reads JSON-LD blocks for structured addresses,
// falls back to <address> tags and bare postcode regex. Early-exit on the
// first useful hit.

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const POSTCODE_RE = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/gi;
const JSON_LD_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const ADDRESS_TAG_RE = /<address\b[^>]*>([\s\S]*?)<\/address>/gi;
const MAILTO_RE = /href=["']mailto:([^"'?]+)/gi;

const IGNORE_EMAIL = [
  'example.com', 'domain.com', 'yourdomain', 'sentry', 'wixpress',
  'squarespace', 'wordpress', 'schema.org', 'w3.org', '.png', '.jpg',
  '.gif', '.svg', 'noreply', 'no-reply', 'google.com', 'goo.gl', 'maps.google',
];

const CONTACT_PATHS = ['/contact', '/contact-us', '/about', '/find-us'];

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const REQUEST_TIMEOUT_MS = 8000;

function normalisePostcode(pc: string): string {
  const stripped = pc.replace(/\s+/g, '').toUpperCase();
  return stripped.length >= 5
    ? `${stripped.slice(0, -3)} ${stripped.slice(-3)}`
    : stripped;
}

export function extractPostcode(text: string): string | null {
  const m = text.match(POSTCODE_RE);
  return m && m.length > 0 ? normalisePostcode(m[0]) : null;
}

function isValidEmail(email: string): boolean {
  const e = email.toLowerCase();
  return !IGNORE_EMAIL.some((p) => e.includes(p));
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractEmailsFromHtml(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(MAILTO_RE)) {
    const e = m[1].trim().toLowerCase();
    if (EMAIL_RE.test(e) && isValidEmail(e)) out.add(e);
    EMAIL_RE.lastIndex = 0;
  }
  const text = stripTags(html);
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase().replace(/[.,;:]+$/, '');
    if (isValidEmail(e)) out.add(e);
  }
  return out;
}

export type AddressExtract = {
  street: string | null;
  city: string | null;
  postcode: string | null;
};

export function extractAddressFromHtml(html: string): AddressExtract {
  // 1. JSON-LD blocks
  for (const m of html.matchAll(JSON_LD_RE)) {
    try {
      const parsed = JSON.parse(m[1].trim()) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const expanded: Record<string, unknown>[] = [];
      for (const it of items) {
        if (it && typeof it === 'object') {
          expanded.push(it as Record<string, unknown>);
          const graph = (it as { '@graph'?: unknown[] })['@graph'];
          if (Array.isArray(graph)) {
            for (const g of graph) {
              if (g && typeof g === 'object') expanded.push(g as Record<string, unknown>);
            }
          }
        }
      }
      for (const it of expanded) {
        const addr = it.address;
        if (addr && typeof addr === 'object') {
          const a = addr as Record<string, unknown>;
          const pc = typeof a.postalCode === 'string' ? a.postalCode : '';
          if (pc) {
            return {
              street: typeof a.streetAddress === 'string' ? a.streetAddress : null,
              city: typeof a.addressLocality === 'string' ? a.addressLocality : null,
              postcode: normalisePostcode(pc),
            };
          }
        }
      }
    } catch {
      // skip malformed JSON-LD block
    }
  }

  // 2. <address> tag
  for (const m of html.matchAll(ADDRESS_TAG_RE)) {
    const text = stripTags(m[1]);
    const pc = extractPostcode(text);
    if (pc) {
      return { street: text.slice(0, 120), city: null, postcode: pc };
    }
  }

  // 3. Bare postcode regex on the whole page
  const pc = extractPostcode(stripTags(html));
  return { street: null, city: null, postcode: pc };
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export type WebsiteEnrichment = {
  emails: string[];
  address: AddressExtract;
};

export async function scrapeWebsiteForEmailsAndAddress(
  websiteUrl: string,
): Promise<WebsiteEnrichment> {
  const empty: WebsiteEnrichment = { emails: [], address: { street: null, city: null, postcode: null } };
  let origin: string;
  try {
    origin = new URL(websiteUrl).origin;
  } catch {
    return empty;
  }

  let emails = new Set<string>();
  let address: AddressExtract = { street: null, city: null, postcode: null };

  // Homepage first
  const home = await fetchPage(websiteUrl);
  if (home) {
    emails = extractEmailsFromHtml(home);
    address = extractAddressFromHtml(home);
    if (emails.size > 0 && address.postcode) {
      return { emails: [...emails].sort(), address };
    }
  }

  // Contact pages, early-exit when both emails and a postcode are found
  for (const path of CONTACT_PATHS) {
    if (emails.size > 0 && address.postcode) break;
    const url = `${origin}${path}`;
    const html = await fetchPage(url);
    if (!html) continue;
    if (emails.size === 0) {
      for (const e of extractEmailsFromHtml(html)) emails.add(e);
    }
    if (!address.postcode) {
      const a = extractAddressFromHtml(html);
      if (a.postcode) address = a;
    }
  }

  return { emails: [...emails].sort(), address };
}

export function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.host.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}
