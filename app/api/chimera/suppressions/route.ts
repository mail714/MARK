import { NextResponse } from 'next/server';
import { addSuppression } from '@/lib/chimera/prospects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const norm = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t === '' ? null : t;
  };
  const email = norm(body.email);
  const domain = norm(body.domain);
  const name = norm(body.business_name);
  if (!email && !domain && !name) {
    return NextResponse.json(
      { error: 'At least one of email, domain or business_name is required' },
      { status: 400 },
    );
  }
  try {
    await addSuppression({
      email,
      domain,
      business_name: name,
      reason: norm(body.reason),
      added_by: norm(body.added_by),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
