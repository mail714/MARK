import { NextResponse } from 'next/server';
import { syncHonoursBoardsCaseStudyImages } from '@/lib/email/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST() {
  try {
    const result = await syncHonoursBoardsCaseStudyImages();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
