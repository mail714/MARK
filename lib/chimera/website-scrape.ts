// Ported from Chimera's email + address scraper. Regex-based parsing — no
// HTML library dependency. Reads JSON-LD blocks for structured addresses,
// falls back to <address> tags and bare postcode regex. Early-exit on the
// first useful hit.

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const POSTCODE_RE = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2})\b/gi;
const JSON_LD_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const ADDRESS_TAG_RE = /<address\b[^>]*>([\s\S]*?)<\/address>/gi;
const MAILTO_RE = /href=["']mailto:([^"'?]+)/gi;

// Common email-obfuscation patterns schools use to thwart scrapers. Each
// regex captures the local-part and the domain separately so we can
// re-assemble a real email address.
const OBFUSCATED_PATTERNS: RegExp[] = [
  // 'office [at] school.uk' / 'office (at) school.uk' / 'office {at} school.uk'
  /([a-zA-Z0-9._%+\-]+)\s*[\[({]\s*at\s*[\])}]\s*([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi,
  // 'office AT school.uk' (single word ' at ' with spaces, must be lowercase 'at' between local-part and domain)
  /([a-zA-Z0-9._%+\-]+)\s+at\s+([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi,
  // 'office [at] school [dot] uk' — split @ and one of the dots
  /([a-zA-Z0-9._%+\-]+)\s*[\[({]\s*at\s*[\])}]\s*([a-zA-Z0-9\-]+)\s*[\[({]\s*dot\s*[\])}]\s*([a-zA-Z]{2,})/gi,
];

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

const REQUEST_TIMEOUT_MS = 15000;

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

// Common HTML entities used to obfuscate emails — @ becomes &#64; or
// &commat;, . becomes &#46; or &period;, and so on. Decode these BEFORE
// the email regex runs so 'office&#64;school.uk' is detected as
// 'office@school.uk'.
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&commat;/gi, '@')
    .replace(/&period;/gi, '.')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) => {
      try {
        return String.fromCodePoint(parseInt(code, 10));
      } catch {
        return ' ';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
      try {
        return String.fromCodePoint(parseInt(code, 16));
      } catch {
        return ' ';
      }
    });
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

// Reassembles 'office [at] school.uk' / 'office at school dot uk' style
// strings into a real email and yields each match. Run on the stripped
// text after the standard regex has already taken its pass.
function* findObfuscatedEmails(text: string): Iterable<string> {
  for (const re of OBFUSCATED_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      // Pattern 3 (the dot-split version) has 3 groups: local, domain-stem, tld
      if (m.length >= 4 && m[3]) {
        yield `${m[1]}@${m[2]}.${m[3]}`.toLowerCase();
      } else {
        yield `${m[1]}@${m[2]}`.toLowerCase();
      }
    }
  }
}

export function extractEmailsFromHtml(html: string): Set<string> {
  const out = new Set<string>();
  // 1. mailto: links in the raw HTML — these are the most reliable signal.
  for (const m of html.matchAll(MAILTO_RE)) {
    const e = decodeHtmlEntities(m[1]).trim().toLowerCase();
    EMAIL_RE.lastIndex = 0;
    if (EMAIL_RE.test(e) && isValidEmail(e)) out.add(e);
  }
  // 2. Raw email regex over the stripped, entity-decoded text. Picks up
  // emails written plainly OR encoded with &#64; / &commat; / etc, since
  // stripTags now decodes entities.
  const text = stripTags(html);
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase().replace(/[.,;:]+$/, '');
    if (isValidEmail(e)) out.add(e);
  }
  // 3. Obfuscation patterns: '[at]', '(at)', ' at ', '[dot]'. Run on the
  // already-decoded text so 'office &#91;at&#93; school.uk' works too.
  for (const e of findObfuscatedEmails(text)) {
    if (isValidEmail(e) && /.+@.+\..+/.test(e)) out.add(e);
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
  } catch (err) {
    // Surface the underlying cause to Render logs — fetch failures are
    // often DNS/TLS/refused at the network layer, which we'd otherwise
    // silently swallow as 'no email found'.
    const cause = err instanceof Error ? (err as { cause?: unknown }).cause : null;
    const causeBits: string[] = [];
    if (cause && typeof cause === 'object') {
      const c = cause as { code?: string; errno?: number; message?: string };
      if (c.code) causeBits.push(`code=${c.code}`);
      if (c.errno) causeBits.push(`errno=${c.errno}`);
      if (c.message) causeBits.push(c.message);
    }
    console.warn(
      `website-scrape fetch failed for ${url}:`,
      err instanceof Error ? err.message : err,
      causeBits.length > 0 ? `(${causeBits.join(', ')})` : '',
    );
    return null;
  }
}

// Anchor tag with capturing groups for attributes and inner text.
const A_TAG_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF_RE = /\bhref=["']([^"']+)["']/i;

// Phrases that suggest a link leads to contact info. Score = the highest
// matching pattern's weight; scoreLink walks the patterns in order and
// reports the best hit. Tuned for UK school sites specifically (key info /
// office / find us are common section labels there).
const CONTACT_LINK_KEYWORDS: { pattern: RegExp; weight: number }[] = [
  { pattern: /contact[ _-]?(?:us|the[ _-]?school|the[ _-]?office)?\b/i, weight: 10 },
  { pattern: /get[ _-]?in[ _-]?touch/i, weight: 9 },
  { pattern: /reach[ _-]?(?:us|out)/i, weight: 8 },
  { pattern: /find[ _-]?(?:us|the[ _-]?school)/i, weight: 7 },
  { pattern: /school[ _-]?office\b/i, weight: 7 },
  { pattern: /\boffice\b/i, weight: 6 },
  { pattern: /key[ _-]?info(?:rmation)?/i, weight: 5 },
  { pattern: /\babout[ _-]?(?:us)?\b/i, weight: 3 },
];

function scoreLink(href: string, anchorText: string): number {
  const haystack = `${href} ${anchorText}`.toLowerCase();
  let score = 0;
  for (const { pattern, weight } of CONTACT_LINK_KEYWORDS) {
    if (pattern.test(haystack) && weight > score) score = weight;
  }
  return score;
}

// Walks every <a href> in the homepage HTML and ranks the ones whose URL
// or anchor text suggests they lead to contact details. Returns the top N
// candidate URLs (absolute, same-origin, deduped) for the scraper to
// follow. Falls back gracefully — anything not parseable as a URL gets
// dropped, external-origin links are skipped, javascript:/mailto:/tel:
// hrefs are ignored.
export function findContactLinks(
  homepageHtml: string,
  homepageUrl: string,
  limit = 6,
): string[] {
  let origin: string;
  let homepageNormalised: string;
  try {
    const u = new URL(homepageUrl);
    origin = u.origin;
    u.hash = '';
    homepageNormalised = u.toString().replace(/\/$/, '');
  } catch {
    return [];
  }

  const ranked = new Map<string, number>(); // url → max score

  for (const m of homepageHtml.matchAll(A_TAG_RE)) {
    const attrs = m[1];
    const inner = m[2];
    const hrefMatch = attrs.match(HREF_RE);
    if (!hrefMatch) continue;
    const rawHref = hrefMatch[1].trim();
    if (
      !rawHref ||
      rawHref.startsWith('#') ||
      rawHref.toLowerCase().startsWith('javascript:') ||
      rawHref.toLowerCase().startsWith('mailto:') ||
      rawHref.toLowerCase().startsWith('tel:')
    ) {
      continue;
    }

    let resolved: URL;
    try {
      resolved = new URL(rawHref, homepageUrl);
    } catch {
      continue;
    }
    if (resolved.origin !== origin) continue;
    resolved.hash = '';
    const normalised = resolved.toString().replace(/\/$/, '');
    if (normalised === homepageNormalised) continue;

    const anchorText = inner
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const score = scoreLink(rawHref, anchorText);
    if (score === 0) continue;

    const existing = ranked.get(resolved.toString()) ?? 0;
    if (score > existing) ranked.set(resolved.toString(), score);
  }

  return [...ranked.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([url]) => url);
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

  // Pull candidate contact-page URLs out of the homepage's actual
  // navigation rather than guessing from a hardcoded list. Falls back to
  // the hardcoded list if there's no homepage HTML to parse or no
  // contact-y links were found in it.
  const seen = new Set<string>();
  let candidates: string[] = [];
  if (home) {
    candidates = findContactLinks(home, websiteUrl);
  }
  if (candidates.length === 0) {
    candidates = CONTACT_PATHS.map((p) => `${origin}${p}`);
  }

  for (const url of candidates) {
    if (emails.size > 0 && address.postcode) break;
    if (seen.has(url)) continue;
    seen.add(url);
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
