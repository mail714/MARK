import { createAdminClient } from '@/lib/supabase/admin';
import { listSocialPostsForRange } from '@/lib/social/posts';
import type { SocialPlatform } from '@/lib/social/platforms';

// Unified shape for anything that lands on the marketing calendar — emails,
// case studies, social posts, etc. The calendar UI doesn't care which
// module produced the event; it cares about brand, sector, date, status and
// a link back to the source's detail page.
export type CalendarEventSource = 'email' | 'case-study' | 'social';

export type CalendarEvent = {
  // Stable id, namespaced by source so we can dedupe / key safely.
  key: string;
  source: CalendarEventSource;
  sourceId: string;
  date: string;                       // ISO
  brandId: string | null;
  sector: string | null;
  title: string;                      // primary line on the card
  subtitle: string | null;            // secondary line (subject, board type, etc.)
  status: string;                     // free-form status string for the pill
  detailHref: string;                 // 'Open' link in the modal
  liveUrl: string | null;             // 'View live' link in the modal (if applicable)
  detail: Record<string, unknown>;    // free-form additional context for the modal
  // Optional platform discriminator for social events. The calendar uses
  // this for per-platform dot colours; other sources leave it null.
  platform?: SocialPlatform | null;
};

async function fetchEmailEvents(
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('email_campaigns')
    .select(
      'id, internal_name, subject, preheader, brand_id, sector, campaign_type, status, planned_send_at, address_book_ids, dotdigital_campaign_id',
    )
    .gte('planned_send_at', start.toISOString())
    .lte('planned_send_at', end.toISOString());
  if (error) throw new Error(`Email events: ${error.message}`);

  const events: CalendarEvent[] = [];
  for (const r of (data ?? []) as Array<{
    id: string;
    internal_name: string | null;
    subject: string | null;
    preheader: string | null;
    brand_id: string | null;
    sector: string | null;
    campaign_type: string | null;
    status: string;
    planned_send_at: string | null;
    address_book_ids: number[];
    dotdigital_campaign_id: number | null;
  }>) {
    if (!r.planned_send_at) continue;
    events.push({
      key: `email-${r.id}`,
      source: 'email',
      sourceId: r.id,
      date: r.planned_send_at,
      brandId: r.brand_id,
      sector: r.sector,
      title: r.internal_name ?? r.subject ?? '(untitled campaign)',
      subtitle: r.subject,
      status: r.status,
      detailHref: `/emails/campaigns/${r.id}`,
      liveUrl: null,
      detail: {
        preheader: r.preheader,
        campaign_type: r.campaign_type,
        address_book_count: r.address_book_ids?.length ?? 0,
        dotdigital_campaign_id: r.dotdigital_campaign_id,
      },
    });
  }
  return events;
}

async function fetchCaseStudyEvents(
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('case_studies')
    .select(
      'id, brand_id, customer_name, drive_folder_name, board_type, board_size, club_types, status, published_at, wix_published_url',
    )
    .gte('published_at', start.toISOString())
    .lte('published_at', end.toISOString());
  if (error) throw new Error(`Case study events: ${error.message}`);

  const events: CalendarEvent[] = [];
  for (const r of (data ?? []) as Array<{
    id: string;
    brand_id: string | null;
    customer_name: string | null;
    drive_folder_name: string;
    board_type: string | null;
    board_size: string | null;
    club_types: string[] | null;
    status: string;
    published_at: string | null;
    wix_published_url: string | null;
  }>) {
    if (!r.published_at) continue;
    const sector = (r.club_types ?? []).join(', ') || null;
    const subtitle =
      r.board_type && r.board_size
        ? `${r.board_type} · ${r.board_size}`
        : r.board_type ?? r.board_size ?? null;
    events.push({
      key: `case-study-${r.id}`,
      source: 'case-study',
      sourceId: r.id,
      date: r.published_at,
      brandId: r.brand_id,
      sector,
      title: r.customer_name ?? r.drive_folder_name,
      subtitle,
      status: 'Published',
      detailHref: `/case-studies/${r.id}`,
      liveUrl: r.wix_published_url,
      detail: {
        board_type: r.board_type,
        board_size: r.board_size,
        club_types: r.club_types,
      },
    });
  }
  return events;
}

async function fetchSocialEvents(
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  const posts = await listSocialPostsForRange(start, end);
  const events: CalendarEvent[] = [];
  for (const p of posts) {
    if (!p.planned_publish_at) continue;
    const captionSnippet = p.caption ? p.caption.slice(0, 80) : null;
    events.push({
      key: `social-${p.id}`,
      source: 'social',
      sourceId: p.id,
      date: p.planned_publish_at,
      brandId: p.brand_id,
      sector: p.sector,
      title: p.internal_name ?? captionSnippet ?? '(social post)',
      subtitle: captionSnippet,
      status: p.status,
      detailHref: `/social/${p.id}`,
      liveUrl: p.live_url,
      platform: p.platform,
      detail: {
        platform: p.platform,
        media_kind: p.media_kind,
        hashtags: p.hashtags,
        media_count: p.media_urls.length,
        shot_brief: p.shot_brief,
        caption: p.caption,
      },
    });
  }
  return events;
}

export async function listCalendarEvents(
  start: Date,
  end: Date,
): Promise<CalendarEvent[]> {
  const [emails, caseStudies, social] = await Promise.all([
    fetchEmailEvents(start, end),
    fetchCaseStudyEvents(start, end),
    fetchSocialEvents(start, end),
  ]);
  return [...emails, ...caseStudies, ...social].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
