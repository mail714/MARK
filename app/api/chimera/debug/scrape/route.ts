import { NextResponse } from 'next/server';
import { debugScrape } from '@/lib/chimera/debug-scrape';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const websiteUrl = typeof body.url === 'string' ? body.url.trim() : '';
  const expectedEmail = typeof body.expected === 'string' ? body.expected.trim() : null;
  if (!websiteUrl) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }
  try {
    const result = await debugScrape({ websiteUrl, expectedEmail });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
