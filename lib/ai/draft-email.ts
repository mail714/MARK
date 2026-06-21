import type Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, getAnthropicClient } from './anthropic';
import {
  buildUserMessage,
  SYSTEM_PROMPT,
  type EmailDraftContext,
} from './prompts/email-draft';
import type { EmailTemplate } from '@/lib/email/templates';

export type EmailDraftResult = {
  toolInput: Record<string, unknown>;
};

export async function draftEmail(
  ctx: EmailDraftContext,
  template: EmailTemplate,
): Promise<EmailDraftResult> {
  const client = getAnthropicClient();
  const userMessage = await buildUserMessage(ctx, template);

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [template.emitTool] as Anthropic.Tool[],
    tool_choice: { type: 'tool', name: template.emitTool.name },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(`Model did not call ${template.emitTool.name} tool`);
  }
  return { toolInput: toolUse.input as Record<string, unknown> };
}
