import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/emails/images/[id]'>;

const EDITABLE_FIELDS = ['sector', 'description', 'alt_text', 'brand_id'] as const;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in body) patch[k] = body[k] || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from('email_images').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
