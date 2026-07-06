import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPushable, type EmailStatus } from '@/lib/zerobounce/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = RouteContext<'/api/chimera/searches/[id]/prospect-ids'>;

// Returns the ids of every prospect in a search that matches the given
// review filter — the backing for 'select all N in this search', which has
// to reach past the 500-row page the table shows. Filter logic mirrors
// ProspectsReview exactly.
type Filter = 'all' | 'with-email' | 'no-email' | 'pushable' | 'blocked' | 'unverified';

const FILTERS = new Set<Filter>(['all', 'with-email', 'no-email', 'pushable', 'blocked', 'unverified']);

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const rawFilter = url.searchParams.get('filter') ?? 'all';
  const filter: Filter = FILTERS.has(rawFilter as Filter) ? (rawFilter as Filter) : 'all';

  try {
    const supabase = createAdminClient();

    const linked: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('prospect_searches')
        .select('prospect_id')
        .eq('search_id', id)
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { prospect_id: string }[];
      linked.push(...rows.map((r) => r.prospect_id));
      if (rows.length < 1000) break;
    }

    const ids: string[] = [];
    for (let i = 0; i < linked.length; i += 200) {
      const chunk = linked.slice(i, i + 200);
      const { data, error } = await supabase
        .from('prospects')
        .select('id, emails, email_statuses')
        .in('id', chunk);
      if (error) throw new Error(error.message);
      for (const p of (data ?? []) as Array<{
        id: string;
        emails: string[];
        email_statuses: Record<string, EmailStatus> | null;
      }>) {
        const emails = p.emails ?? [];
        const statuses = p.email_statuses ?? {};
        const statusOf = (e: string) => statuses[e.trim().toLowerCase()];
        const matches =
          filter === 'all'
            ? true
            : filter === 'with-email'
              ? emails.length > 0
              : filter === 'no-email'
                ? emails.length === 0
                : filter === 'pushable'
                  ? emails.length > 0 &&
                    emails.some((e) => {
                      const s = statusOf(e);
                      return !s || isPushable(s);
                    })
                  : filter === 'blocked'
                    ? emails.length > 0 &&
                      emails.every((e) => {
                        const s = statusOf(e);
                        return !!s && !isPushable(s);
                      })
                    : emails.length > 0 && emails.some((e) => !statusOf(e)); // unverified
        if (matches) ids.push(p.id);
      }
    }

    return NextResponse.json({ ids, total: ids.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
