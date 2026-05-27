import { NextResponse } from 'next/server';
import { generateCaseStudyForFolder } from '@/lib/case-studies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Extraction downloads two PDFs and parses them; give it room.
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { driveFolderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const driveFolderId = body.driveFolderId;
  if (!driveFolderId) {
    return NextResponse.json({ error: 'driveFolderId is required' }, { status: 400 });
  }

  try {
    const id = await generateCaseStudyForFolder(driveFolderId);
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
