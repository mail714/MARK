export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'pinterest';

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
};

// Visual coding on the calendar and lists. Loose Tailwind classes — same
// shape as brand-colours so the calendar can render a dot per platform.
export const PLATFORM_DOT: Record<SocialPlatform, string> = {
  instagram: 'bg-pink-500',
  facebook: 'bg-blue-600',
  tiktok: 'bg-neutral-900',
  linkedin: 'bg-sky-700',
  pinterest: 'bg-red-600',
};

// Which platforms each brand publishes to. signet-play deliberately omitted
// until the operator's ready to expand into it.
export const PLATFORMS_BY_BRAND_SLUG: Record<string, SocialPlatform[]> = {
  'honours-boards': ['instagram', 'facebook', 'tiktok'],
  'signet-signs': ['instagram', 'facebook', 'tiktok', 'linkedin'],
};

export function platformsForBrand(slug: string | null | undefined): SocialPlatform[] {
  if (!slug) return [];
  return PLATFORMS_BY_BRAND_SLUG[slug] ?? [];
}

// TikTok and Instagram reels are video-first. Everything else defaults to
// image. The AI drafter uses this to know whether to write a 'film this'
// brief or just pick stills from the library.
export function defaultMediaKindFor(platform: SocialPlatform): 'image' | 'video' {
  return platform === 'tiktok' ? 'video' : 'image';
}
