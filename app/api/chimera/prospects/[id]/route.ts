import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { domainOf, normaliseWebsiteUrl } from '@/lib/chimera/website-scrape';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/chimera/prospects/[id]'>;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.website === 'string' || body.website === null) {
    const normalised =
      typeof body.website === 'string' ? normaliseWebsiteUrl(body.website) : null;
    patch.website = normalised;
    patch.website_domain = domainOf(normalised);
  }
  if (typeof body.phone === 'string' || body.phone === null) {
    patch.phone = body.phone;
  }
  if (Array.isArray(body.emails)) {
    patch.emails = (body.emails as unknown[])
      .filter((e): e is string => typeof e === 'string')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /.+@.+\..+/.test(e));
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('prospects').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, patch });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
