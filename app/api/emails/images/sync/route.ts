import { NextResponse } from 'next/server';
import {
  syncHonoursBoardsCaseStudyImages,
  syncSignetSignsProductImages,
} from '@/lib/email/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: Request) {
  let body: { brand?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const brand = (body.brand ?? 'honours-boards').trim();
  try {
    if (brand === 'honours-boards') {
      const result = await syncHonoursBoardsCaseStudyImages();
      return NextResponse.json({ ok: true, brand, ...result });
    }
    if (brand === 'signet-signs') {
      const result = await syncSignetSignsProductImages();
      return NextResponse.json({ ok: true, brand, ...result });
    }
    return NextResponse.json({ error: `Unknown brand: ${brand}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
