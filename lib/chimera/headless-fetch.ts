import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Headless-Chromium page render — MARK's OWN way of reading a site "like a
// browser": it actually executes the page's JavaScript, so emails injected
// by scripts (Wix / Squarespace / React sites) end up in the HTML we scan.
// Free of ScrapingBee credits; it uses Render's own CPU/RAM.
//
// It CANNOT beat a datacenter-IP block (Render's IP is still a datacenter
// IP, so a hard Cloudflare/WAF block stays blocked) — that's what Deep scan
// (residential IPs) is for. This wins the JavaScript-rendered-email case.
//
// Fenced to fail safe: if Chromium can't launch (missing libs on the host,
// OOM, etc.) it disables itself after the first failure and every caller
// just gets null, so Rescan silently falls back to the plain fetch. It can
// never break the existing behaviour.

let browserPromise: Promise<Browser> | null = null;
let disabled = process.env.HEADLESS_BROWSER === '0';

export function isHeadlessDisabled(): boolean {
  return disabled;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      })
      .catch((err) => {
        // Launch failed — disable for the rest of the process so we don't
        // pay the (slow) failure on every subsequent prospect.
        disabled = true;
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

const BLOCK_TYPES = new Set(['image', 'media', 'font', 'stylesheet']);

// Serialise renders to one page at a time. The rescan runs several workers
// in parallel; without this, each would open its own Chromium page and the
// combined memory can OOM a small Render instance. One-at-a-time is plenty
// fast because the headless step only fires for the minority of sites the
// plain fetch couldn't read.
let renderQueue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = renderQueue.then(fn, fn);
  renderQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function renderPageHeadless(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  if (disabled) return Promise.resolve(null);
  return withLock(() => renderOne(url, opts));
}

async function renderOne(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  if (disabled) return null;
  const timeout = opts.timeoutMs ?? 20_000;

  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (err) {
    console.warn(
      'headless browser unavailable — falling back to plain fetch:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    );
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });
    // Skip images/fonts/media/CSS — we only need the DOM text. Big speed
    // and memory win, which matters when rendering hundreds of sites.
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (BLOCK_TYPES.has(req.resourceType())) req.abort().catch(() => {});
      else req.continue().catch(() => {});
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout });
    // A short settle for any late script that injects the footer/contact
    // block after network idle.
    await new Promise((r) => setTimeout(r, 1200));
    return await page.content();
  } catch (err) {
    console.warn(
      `headless render failed for ${url}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}
