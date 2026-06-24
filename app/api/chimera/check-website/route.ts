import { NextResponse } from 'next/server';
import { fetchPageWithSource, normaliseWebsiteUrl } from '@/lib/chimera/website-scrape';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Verifies a URL is reachable. Used by the 'Update website' modal so the
// operator can sanity-check a pasted URL before saving. Uses the same
// fetcher as the scraper — direct first, ScrapingBee fallback — so if
// the host blocks Render but ScrapingBee can reach it, we still report
// 'reachable'.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const raw = typeof body.url === 'string' ? body.url.trim() : '';
  if (!raw) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }
  const normalised = normaliseWebsiteUrl(raw);
  if (!normalised) {
    return NextResponse.json({ error: 'Could not parse that URL' }, { status: 400 });
  }
  try {
    const result = await fetchPageWithSource(normalised);
    return NextResponse.json({
      ok: result.html !== null,
      source: result.source,
      finalUrl: result.finalUrl,
      bytes: result.html?.length ?? 0,
      directError: result.directError,
      scrapingBeeError: result.scrapingBeeError,
      normalisedUrl: normalised,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
