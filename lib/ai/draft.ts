import { DEFAULT_MODEL, getAnthropicClient } from './anthropic';
import { hasExemplars } from './exemplars';
import {
  buildUserMessage,
  DRAFT_FIELD_KEYS,
  EMIT_TOOL,
  SYSTEM_PROMPT,
  type DraftFields,
} from './prompts/case-study-draft';
import type { ExtractedSpec } from '@/lib/pdf/extract';
import type { CaseStudy } from '@/lib/types';

export async function draftCaseStudy(
  spec: ExtractedSpec,
  caseStudy: Pick<CaseStudy, 'club_types' | 'customer_name'>,
): Promise<DraftFields> {
  if (!hasExemplars()) {
    throw new Error(
      'No exemplars configured. Voice grounding requires at least two real ' +
        'case studies in lib/ai/exemplars.ts before drafting.',
    );
  }

  const client = getAnthropicClient();
  const userMessage = buildUserMessage(spec, caseStudy);

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    system: [
      // Cache the voice guidelines + exemplars across calls.
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [EMIT_TOOL],
    tool_choice: { type: 'tool', name: EMIT_TOOL.name },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not call emit_case_study tool');
  }
  const input = toolUse.input as Partial<DraftFields>;
  const missing = DRAFT_FIELD_KEYS.filter((k) => !input[k] || typeof input[k] !== 'string');
  if (missing.length) {
    throw new Error(`Model output missing fields: ${missing.join(', ')}`);
  }
  return input as DraftFields;
}
