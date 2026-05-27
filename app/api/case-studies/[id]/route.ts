import { NextResponse } from 'next/server';
import { getCaseStudy, updateCaseStudyFields } from '@/lib/case-studies';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EDITABLE_FIELDS = [
  'customer_name',
  'so_number',
  'board_type',
  'board_size',
  'back_colour',
  'text_colour',
  'edge_details',
  'fixings',
  'club_types',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

export async function GET(_req: Request, ctx: RouteContext<'/api/case-studies/[id]'>) {
  const { id } = await ctx.params;
  const cs = await getCaseStudy(id);
  if (!cs) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(cs);
}

export async function PATCH(req: Request, ctx: RouteContext<'/api/case-studies/[id]'>) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS as readonly EditableField[]) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields supplied' }, { status: 400 });
  }

  try {
    await updateCaseStudyFields(id, updates);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
