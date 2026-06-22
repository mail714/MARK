import { DEFAULT_MODEL, getAnthropicClient } from './anthropic';
import {
  buildUserMessage,
  EMIT_TOOL,
  SYSTEM_PROMPT,
  type SocialDraftContext,
} from './prompts/social-draft';
import type { SocialPlatform } from '@/lib/social/platforms';

export type DraftedPost = {
  platform: SocialPlatform;
  caption: string;
  hashtags: string[];
  media_picks: string[];
  media_kind: 'image' | 'video' | 'none';
  shot_brief: string;
};

export type SocialDraftResult = {
  posts: DraftedPost[];
};

export async function draftSocialPosts(ctx: SocialDraftContext): Promise<SocialDraftResult> {
  const client = getAnthropicClient();
  const userMessage = buildUserMessage(ctx);

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [EMIT_TOOL],
    tool_choice: { type: 'tool', name: EMIT_TOOL.name },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not call emit_social_posts');
  }
  const input = toolUse.input as { posts?: DraftedPost[] };
  if (!Array.isArray(input.posts) || input.posts.length === 0) {
    throw new Error('emit_social_posts returned no posts');
  }
  return { posts: input.posts };
}
