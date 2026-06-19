import { NextResponse } from 'next/server';
import {
  syncHonoursBoardsCaseStudyImages,
  syncSignetSignsMediaFolderImages,
  syncSignetSignsProductImages,
} from '@/lib/email/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: { source?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const source = (body.source ?? 'honours-boards-case-studies').trim();
  try {
    if (source === 'honours-boards-case-studies') {
      const result = await syncHonoursBoardsCaseStudyImages();
      return NextResponse.json({ ok: true, source, ...result });
    }
    if (source === 'signet-signs-products') {
      const result = await syncSignetSignsProductImages();
      return NextResponse.json({ ok: true, source, ...result });
    }
    if (source === 'signet-signs-media') {
      const result = await syncSignetSignsMediaFolderImages();
      return NextResponse.json({ ok: true, source, ...result });
    }
    return NextResponse.json({ error: `Unknown source: ${source}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
