import { createAdminClient } from '@/lib/supabase/admin';
import type { SocialPlatform } from './platforms';

export type SocialPostStatus = 'draft' | 'approved' | 'scheduled' | 'published' | 'failed';
export type SocialSourceType = 'case-study' | 'email' | 'standalone';
export type SocialMediaKind = 'image' | 'video' | 'none';

export type SocialPost = {
  id: string;
  brand_id: string | null;
  status: SocialPostStatus;
  platform: SocialPlatform;
  source_type: SocialSourceType | null;
  source_id: string | null;
  sector: string | null;
  internal_name: string | null;
  caption: string | null;
  hashtags: string[];
  media_urls: string[];
  media_alts: string[];
  media_kind: SocialMediaKind | null;
  shot_brief: string | null;
  cta_url: string | null;
  planned_publish_at: string | null;
  scheduler_post_id: string | null;
  live_url: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SocialPostListItem = Pick<
  SocialPost,
  | 'id'
  | 'brand_id'
  | 'platform'
  | 'status'
  | 'sector'
  | 'internal_name'
  | 'caption'
  | 'media_urls'
  | 'planned_publish_at'
  | 'source_type'
  | 'source_id'
  | 'updated_at'
>;

const EDITABLE_FIELDS = [
  'brand_id',
  'status',
  'platform',
  'sector',
  'internal_name',
  'caption',
  'hashtags',
  'media_urls',
  'media_alts',
  'media_kind',
  'shot_brief',
  'cta_url',
  'planned_publish_at',
] as const;

export async function listSocialPosts(): Promise<SocialPostListItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('social_posts')
    .select(
      'id, brand_id, platform, status, sector, internal_name, caption, media_urls, planned_publish_at, source_type, source_id, updated_at',
    )
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to load social posts: ${error.message}`);
  return (data as SocialPostListItem[]) ?? [];
}

export async function getSocialPost(id: string): Promise<SocialPost | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load social post: ${error.message}`);
  return (data as SocialPost | null) ?? null;
}

export async function listSocialPostsForRange(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<SocialPost[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .gte('planned_publish_at', rangeStart.toISOString())
    .lte('planned_publish_at', rangeEnd.toISOString())
    .order('planned_publish_at', { ascending: true });
  if (error) throw new Error(`Failed to load calendar social posts: ${error.message}`);
  return (data as SocialPost[]) ?? [];
}

export async function updateSocialPost(
  id: string,
  fields: Partial<Pick<SocialPost, (typeof EDITABLE_FIELDS)[number]>>,
): Promise<void> {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in fields) patch[k] = (fields as Record<string, unknown>)[k];
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from('social_posts').update(patch).eq('id', id);
  if (error) throw new Error(`Failed to update social post: ${error.message}`);
}

export async function deleteSocialPost(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('social_posts').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete social post: ${error.message}`);
}

export type CreateSocialPostArgs = Omit<
  Partial<SocialPost>,
  'id' | 'created_at' | 'updated_at'
> & {
  platform: SocialPlatform;
};

export async function createSocialPost(args: CreateSocialPostArgs): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('social_posts')
    .insert({
      status: 'draft',
      hashtags: [],
      media_urls: [],
      media_alts: [],
      ...args,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create social post: ${error.message}`);
  return data.id as string;
}
