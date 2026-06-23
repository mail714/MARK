// Helpers for turning the dotdigital-reported URL into something readable in
// the link-clicks panel: stripping UTM cruft for display, surfacing the
// utm_content tag as the link's purpose, and pairing each URL with the
// anchor text it had inside the drafted HTML.

export type ParsedLink = {
  fullUrl: string;          // exactly as stored (with UTMs)
  baseUrl: string;          // host + path (+ any non-utm query) for display
  purpose: string | null;   // utm_content if present (e.g. 'hero-cta')
};

export function parseTrackedUrl(url: string): ParsedLink {
  try {
    const u = new URL(url);
    const purpose = u.searchParams.get('utm_content');
    const cleanParams = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (!k.toLowerCase().startsWith('utm_')) cleanParams.append(k, v);
    });
    const qs = cleanParams.toString();
    const baseUrl = `${u.host}${u.pathname}${qs ? `?${qs}` : ''}`;
    return { fullUrl: url, baseUrl, purpose };
  } catch {
    return { fullUrl: url, baseUrl: url, purpose: null };
  }
}

// Walks the drafted HTML and builds a URL → visible anchor text map. Lets
// the click panel show 'Read the full case study →' instead of just the URL.
// Strips nested tags inside <a> so a button's table-wrapped text comes through.
export function extractAnchorTexts(html: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!html) return map;
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const url = decodeAmp(m[1]);
    const text = m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text && !map.has(url)) map.set(url, text);
  }
  return map;
}

function decodeAmp(s: string): string {
  return s.replace(/&amp;/g, '&');
}

// URL with UTMs may not match the exact stored URL byte-for-byte (e.g.
// dotdigital occasionally appends its own tracker). Fallback lookup that
// matches by everything-up-to-the-fragment so anchor text still surfaces.
export function findAnchorText(
  anchors: Map<string, string>,
  storedUrl: string,
): string | null {
  const exact = anchors.get(storedUrl);
  if (exact) return exact;
  // Match by base+search (ignore fragments and trailing slash).
  const norm = (u: string) => {
    try {
      const x = new URL(u);
      return `${x.origin}${x.pathname.replace(/\/$/, '')}?${x.searchParams.toString()}`;
    } catch {
      return u;
    }
  };
  const target = norm(storedUrl);
  for (const [k, v] of anchors) {
    if (norm(k) === target) return v;
  }
  return null;
}
