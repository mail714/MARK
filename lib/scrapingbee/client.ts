// Thin wrapper around ScrapingBee's REST API. Used as a fallback when a
// direct fetch fails (TCP timeout, refused, 4xx, etc.) — typical when
// small UK hosts block VPS IPs. ScrapingBee fetches via residential
// browser IPs the host won't recognise as a cloud scraper.
//
// render_js=true renders the page in a real Chromium so JavaScript-loaded
// content (cookie banners, async-injected emails, etc.) is in the
// returned HTML. Costs 5 credits per request with JS, 1 without.

const BASE_URL = 'https://app.scrapingbee.com/api/v1/';

export class ScrapingBeeError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

function apiKey(): string | null {
  const k = process.env.SCRAPINGBEE_API_KEY;
  return k && k.trim() ? k.trim() : null;
}

export function isScrapingBeeConfigured(): boolean {
  return apiKey() !== null;
}

export type ScrapingBeeFetchOptions = {
  renderJs?: boolean;        // default true — turns ON browser rendering
  countryCode?: string;      // default 'gb' for UK schools / businesses
  premiumProxy?: boolean;    // default false — costs more, only when basic fails
  timeoutMs?: number;        // overall request timeout
};

export async function fetchViaScrapingBee(
  url: string,
  opts: ScrapingBeeFetchOptions = {},
): Promise<string> {
  const key = apiKey();
  if (!key) throw new ScrapingBeeError('SCRAPINGBEE_API_KEY is not set', 0);

  const params = new URLSearchParams({
    api_key: key,
    url,
    render_js: String(opts.renderJs ?? true),
    country_code: opts.countryCode ?? 'gb',
  });
  if (opts.premiumProxy) params.set('premium_proxy', 'true');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
  try {
    const res = await fetch(`${BASE_URL}?${params.toString()}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ScrapingBeeError(
        `ScrapingBee returned ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
