import { NextResponse } from 'next/server';
import { setPhotoRole, updatePhotoAlt } from '@/lib/case-study-photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/case-studies/[id]/photos/[photoId]'>;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, photoId } = await ctx.params;
  let body: { role?: 'main' | 'image_2'; alt_text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  try {
    if (body.role) {
      if (body.role !== 'main' && body.role !== 'image_2') {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      await setPhotoRole(id, photoId, body.role, body.alt_text);
    } else if (typeof body.alt_text === 'string') {
      await updatePhotoAlt(id, photoId, body.alt_text);
    } else {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
