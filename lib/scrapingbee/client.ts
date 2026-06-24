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
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const timer = setTimeout(() => controller.abort('client-side timeout'), timeoutMs);
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
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ScrapingBeeError(
        `ScrapingBee request timed out after ${Math.round(timeoutMs / 1000)}s — school sites with heavy JS + cookie banners can be slow to render.`,
        408,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ScrapingBee's AI extraction endpoint. Takes a URL plus a JSON object of
// extraction rules (one prompt per field) and returns the extracted values.
// They handle JS rendering, contact-page navigation and email parsing on
// their side. Costs more credits per call than a plain fetch (~25 with JS
// rendering) but gets the email when our regex + nav cascade can't.
export async function extractViaScrapingBeeAi<T extends Record<string, string>>(
  url: string,
  rules: T,
  opts: ScrapingBeeFetchOptions = {},
): Promise<Partial<Record<keyof T, string | null>>> {
  const key = apiKey();
  if (!key) throw new ScrapingBeeError('SCRAPINGBEE_API_KEY is not set', 0);

  const params = new URLSearchParams({
    api_key: key,
    url,
    render_js: String(opts.renderJs ?? true),
    country_code: opts.countryCode ?? 'gb',
    ai_extract_rules: JSON.stringify(rules),
  });
  if (opts.premiumProxy) params.set('premium_proxy', 'true');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  try {
    const res = await fetch(`${BASE_URL}?${params.toString()}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ScrapingBeeError(
        `ScrapingBee AI extraction returned ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }
    const body = await res.text();
    try {
      return JSON.parse(body) as Partial<Record<keyof T, string | null>>;
    } catch {
      throw new ScrapingBeeError(
        `ScrapingBee AI extraction returned non-JSON body: ${body.slice(0, 200)}`,
        200,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}
