import { DEFAULT_MODEL, getAnthropicClient } from './anthropic';
import {
  buildUserMessage,
  DRAFT_FIELD_KEYS,
  EMIT_TOOL,
  SYSTEM_PROMPT,
  type EmailDraftContext,
  type EmailDraftFields,
  type ToolSchema,
} from './prompts/email-draft';

export async function draftEmail(ctx: EmailDraftContext): Promise<EmailDraftFields> {
  const client = getAnthropicClient();
  const userMessage = await buildUserMessage(ctx);

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 3000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [EMIT_TOOL] as ToolSchema[],
    tool_choice: { type: 'tool', name: EMIT_TOOL.name },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not call emit_email tool');
  }
  const input = toolUse.input as Partial<EmailDraftFields>;
  const missing = DRAFT_FIELD_KEYS.filter((k) => !input[k] || typeof input[k] !== 'string');
  if (missing.length) {
    throw new Error(`Model output missing fields: ${missing.join(', ')}`);
  }
  return input as EmailDraftFields;
}
