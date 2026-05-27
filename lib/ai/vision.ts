import type Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, getAnthropicClient } from './anthropic';
import type { CaseStudy } from '@/lib/types';

export type VisionCandidate = {
  driveFileId: string;
  originalFilename: string | null;
  thumbBase64: string;
  thumbContentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
};

export type VisionSelection = {
  mainIndex: number;
  mainAltText: string;
  image2Index: number;
  image2AltText: string;
};

const SYSTEM_PROMPT = `You are picking photos for a published case study on https://www.honours-boards.co.uk.

You will be shown candidate photos from an installed honours-boards job, numbered starting at 1. Choose two:

- MAIN IMAGE: a clean, well-lit hero shot of the finished board installed on its wall. Whole-board visibility, square-on or near-square, sensible framing, no people obscuring the board. This is the image that opens the case study.
- IMAGE 2: a detail shot. Close-up of lettering, frame, crest, fixings, or a unique design feature. Should clearly add a second perspective to the hero, not duplicate it.

Pick the two best candidates available. If only one usable shot exists, pick the same one twice and write distinct alt texts.

For each, write an alt text 80–140 characters that names the customer, the board type, and a visible feature. Reference examples:
- "Wooden cricket honours board for The Hit or Miss Cricket Club showing yearly batting and bowling records."
- "Large dark wood Masonic honours board for St Aubyn Chapter No 20 installed on an interior wall."
- "Oxford University Lawn Tennis Club honours board with blue ACM panel and oak frame."

Return your choices via the emit_selection tool.`;

const EMIT_TOOL = {
  name: 'emit_selection',
  description: 'Emit the two chosen photo indexes and their alt texts.',
  input_schema: {
    type: 'object' as const,
    required: ['main_index', 'main_alt_text', 'image2_index', 'image2_alt_text'],
    properties: {
      main_index: {
        type: 'integer',
        description: '1-based index of the chosen main image (hero shot).',
        minimum: 1,
      },
      main_alt_text: {
        type: 'string',
        description: 'Alt text for the main image, 80–140 chars.',
      },
      image2_index: {
        type: 'integer',
        description: '1-based index of the chosen detail image.',
        minimum: 1,
      },
      image2_alt_text: {
        type: 'string',
        description: 'Alt text for the detail image, 80–140 chars.',
      },
    },
  },
};

export async function pickHeroAndDetailImages(
  candidates: VisionCandidate[],
  caseStudy: Pick<CaseStudy, 'customer_name' | 'board_type' | 'club_types'>,
): Promise<VisionSelection> {
  if (candidates.length === 0) {
    throw new Error('No candidate photos supplied');
  }

  const client = getAnthropicClient();

  const description = [
    `Customer: ${caseStudy.customer_name ?? 'unknown'}`,
    `Board type: ${caseStudy.board_type ?? 'unknown'}`,
    `Club / sector: ${(caseStudy.club_types ?? []).join(', ') || 'unknown'}`,
    `${candidates.length} candidate photo(s) follow, numbered from 1.`,
  ].join('\n');

  const content: Anthropic.MessageParam['content'] = [
    { type: 'text', text: description },
  ];
  candidates.forEach((c, i) => {
    content.push({ type: 'text', text: `Photo ${i + 1} — ${c.originalFilename ?? c.driveFileId}` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: c.thumbContentType, data: c.thumbBase64 },
    });
  });
  content.push({ type: 'text', text: 'Now call emit_selection with your two picks.' });

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [EMIT_TOOL] as Anthropic.Tool[],
    tool_choice: { type: 'tool', name: EMIT_TOOL.name },
    messages: [{ role: 'user', content }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not call emit_selection tool');
  }
  const input = toolUse.input as {
    main_index: number;
    main_alt_text: string;
    image2_index: number;
    image2_alt_text: string;
  };

  const clamp = (n: number) => Math.min(Math.max(1, n), candidates.length) - 1;
  return {
    mainIndex: clamp(input.main_index),
    mainAltText: input.main_alt_text,
    image2Index: clamp(input.image2_index),
    image2AltText: input.image2_alt_text,
  };
}
