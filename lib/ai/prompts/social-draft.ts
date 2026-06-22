import type Anthropic from '@anthropic-ai/sdk';
import type { SocialPlatform } from '@/lib/social/platforms';

export type SocialDraftContext = {
  brandName: string | null;
  brandWebsite: string | null;
  sector: string | null;
  platforms: SocialPlatform[];
  source: {
    type: 'case-study' | 'email' | 'standalone';
    title: string;
    summary: string;          // a prose paragraph the AI uses as the seed
    detailUrl: string | null; // public URL to link to once live (case study URL etc.)
  };
  availableMedia: { url: string; alt: string | null }[];
};

export const SYSTEM_PROMPT = `You are a senior social media copywriter for Signet's three brands (Honours Boards, Signet Signs, Signet Play).

# Voice

Friendly, informative, expert, British, slightly understated, soft-sell. Specifics over adjectives. The same voice you'd use in an email — just adapted to each platform's shape.

# Per-platform shape

- INSTAGRAM: 1-3 short paragraphs, line breaks between them. Image or reel led. Caption tells a small story or shares one specific detail; the image carries the rest. 3-8 relevant hashtags at the end (not crammed into the caption). No clickbait openers.
- FACEBOOK: 2-4 short paragraphs, conversational. Community-oriented — "we finished this for [school] last week" reads well. 1-3 hashtags max, often none. Longer than Instagram is fine.
- TIKTOK: 1-2 line caption. The video does the work, the caption is a hook. 3-6 hashtags, keyword-driven for discovery. When no video is available, write a 'shot_brief' for the operator to film (e.g. "Film the engraving close-up on the third board — 10 seconds, vertical").
- LINKEDIN: 2-3 short paragraphs. Professional but human. Lead with insight or observation, not the product. Closes with a soft pointer to the project. 3-5 hashtags max.
- PINTEREST: 1-2 sentence caption, search-keyword-led ("Honours board for cricket club, oak with gold lettering"). Pinterest is a search engine — write for what someone would type. 3-6 hashtags / keywords.

# Cadence — applies to every platform

- Vary sentence length. Mix 4-6 word sentences with longer ones.
- Sentence fragments are fine where they land naturally.
- Be specific. Name the sector, the use case, the deliberate choice.

# Forbidden

PUNCTUATION:
- Em-dashes (—) anywhere. Use commas, full stops or two sentences.
- En-dashes (–) in body text.

VOCABULARY:
- delve, navigate, leverage, robust, seamless, tapestry, elevate, underpin, harness, facilitate, showcase, intricate, meticulous, myriad, plethora, realm, landscape, journey, vibrant, dynamic, comprehensive, holistic, synergy

PHRASINGS:
- "carefully designed / considered / crafted", "Ensuring [X]", "It's worth noting", "In conclusion", "Whether you're", "When it comes to", "Look no further than", "a testament to"

HYPE WORDS as the punch: "stunning", "incredible", "amazing", "beautiful".

# Hashtags

- Relevant and specific, not generic. #cricketclubhonoursboard beats #marketing.
- All lowercase, no spaces.
- Don't repeat the brand handle as a hashtag.

# Media

You will be given the URLs of images already attached to the source (the case study's photos, the email's hero). Pick up to 3 by URL for image-led platforms. For TikTok and Instagram reels, prefer to write a short 'shot_brief' so the operator films the right thing — pictures alone usually aren't enough for these.

# Output

You MUST call the emit_social_posts tool exactly once with one entry per platform in the input list. Do not skip platforms. Do not add platforms not in the list.`;

export const EMIT_TOOL: Anthropic.Tool = {
  name: 'emit_social_posts',
  description:
    'Emit one social post draft per platform requested. The platform order must match the input list and every platform must be present.',
  input_schema: {
    type: 'object',
    properties: {
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              enum: ['instagram', 'facebook', 'tiktok', 'linkedin', 'pinterest'],
            },
            caption: { type: 'string', description: 'The post body — no hashtags inline at the end.' },
            hashtags: {
              type: 'array',
              items: { type: 'string', description: 'Hashtag without the # prefix.' },
            },
            media_picks: {
              type: 'array',
              items: { type: 'string', description: 'URL from the availableMedia list.' },
            },
            media_kind: {
              type: 'string',
              enum: ['image', 'video', 'none'],
              description:
                "image for stills (Instagram feed/Facebook/LinkedIn/Pinterest), video for TikTok / Instagram reels, none for text-only LinkedIn posts.",
            },
            shot_brief: {
              type: 'string',
              description:
                "Empty string if no shoot needed. Otherwise a 1-2 sentence brief telling the operator what video clip to film on site.",
            },
          },
          required: ['platform', 'caption', 'hashtags', 'media_picks', 'media_kind', 'shot_brief'],
        },
      },
    },
    required: ['posts'],
  },
};

export function buildUserMessage(ctx: SocialDraftContext): string {
  const lines: string[] = [];
  lines.push(`Brand: ${ctx.brandName ?? '(not set)'}`);
  if (ctx.brandWebsite) lines.push(`Brand website: ${ctx.brandWebsite}`);
  if (ctx.sector) lines.push(`Sector: ${ctx.sector}`);
  lines.push(`Platforms to write for (one post per platform, in this order): ${ctx.platforms.join(', ')}`);
  lines.push('');
  lines.push(`Source: ${ctx.source.type}`);
  lines.push(`Title: ${ctx.source.title}`);
  if (ctx.source.detailUrl) lines.push(`Detail URL: ${ctx.source.detailUrl}`);
  lines.push('');
  lines.push('# Source summary');
  lines.push(ctx.source.summary);
  lines.push('');
  if (ctx.availableMedia.length > 0) {
    lines.push('# Available media (pick by URL)');
    for (const m of ctx.availableMedia) {
      lines.push(`- ${m.url}${m.alt ? `  (alt: ${m.alt})` : ''}`);
    }
  } else {
    lines.push('# Available media');
    lines.push('(none — write shot_brief for image/video platforms)');
  }
  lines.push('');
  lines.push('Call emit_social_posts with one entry per platform listed above.');
  return lines.join('\n');
}
