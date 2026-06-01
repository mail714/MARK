// Use Claude to extract the canonical board spec from the proof PDF text.
// Robust to layout variations: single-board vs multi-board proofs, different
// field labels, new fields like Stain / Frame / Grain Direction. Falls back
// gracefully when fields aren't present.

import type Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, getAnthropicClient } from './anthropic';

export type SpecExtraction = {
  boardType: 'Wooden' | 'Acrylic' | 'Lettering' | null;
  boardSize: string | null;
  material: string | null;
  background: string | null;
  graphics: string | null;
  fixings: string | null;
  style: string | null;
  boardCount: number;
};

const SYSTEM_PROMPT = `You extract the canonical board specification from honours-board sales-order and proof PDFs.

The proof is the authoritative source for board specs. The sales order is supporting context (customer name, dimensions in some line items).

Different proofs use different layouts:
- Multi-board proofs label each board with "BOARD REF N - <board name>" and list per-board fields
- Single-board proofs list one set of fields with no BOARD REF prefix
- Field labels vary: Size / Material / Background / Graphics / Fixings / Frame / Stain / Logo

Extract the CANONICAL spec — the single set of properties that describes the job. If a multi-board proof has slight variations between boards (e.g. mostly 740×1200mm with two 1270×1200mm), pick the dominant value for boardSize.

Field guidance:
- boardType: Wooden / Acrylic / Lettering. Infer from material. Acrylic boards mention "acrylic" in material. Wooden boards mention oak, MDF, wood, veneer. Lettering jobs are vinyl letters applied directly to a wall, no panel.
- boardSize: width × height in mm, e.g. "1200 x 1200mm" or "740 x 1200mm". Trim trailing % SCALE notes.
- material: the panel material. For wooden boards include the frame if mentioned (e.g. "Light oak faced MDF with solid oak frame"). For acrylic include thickness (e.g. "8mm clear acrylic"). Sentence case, not ALL CAPS.
- background: the panel backing. For acrylic boards this is typically vinyl applied to the reverse (e.g. "Solid black vinyl to the rear"). For wooden boards leave null — there is no separate background.
- graphics: the lettering / vinyl colour and finish (e.g. "Matt black cut vinyl", "Gold Avery 736 vinyl lettering"). Sentence case.
- fixings: how the board mounts (e.g. "Brass mirror fixings", "19mm stand-off black fixings"). Strip editorial asides like "(shown as silver so visible)".
- style: the overall description including top shape and material (e.g. "Gable top acrylic honours boards", "Flat top wooden honours board"). Sentence case. Derive from the title/section header on the proof.
- boardCount: total number of boards in the job. 1 for single-board proofs, higher for multi-board (count BOARD REF entries or read the sales-order quantity).

All text values should be sentence case, not ALL CAPS. Use null for any field genuinely absent from the source.

Use the emit_spec tool to return the result.`;

const EMIT_TOOL = {
  name: 'emit_spec',
  description: 'Emit the canonical board spec extracted from the source PDFs.',
  input_schema: {
    type: 'object' as const,
    required: ['boardType', 'boardSize', 'material', 'graphics', 'fixings', 'style', 'boardCount'],
    properties: {
      boardType: { type: ['string', 'null'], enum: ['Wooden', 'Acrylic', 'Lettering', null] },
      boardSize: { type: ['string', 'null'] },
      material: { type: ['string', 'null'] },
      background: { type: ['string', 'null'] },
      graphics: { type: ['string', 'null'] },
      fixings: { type: ['string', 'null'] },
      style: { type: ['string', 'null'] },
      boardCount: { type: 'integer', minimum: 1 },
    },
  },
};

export async function extractSpecWithClaude(args: {
  proofText: string;
  salesOrderText: string | null;
}): Promise<SpecExtraction> {
  const client = getAnthropicClient();
  const userMessage = [
    'Extract the canonical board spec for the job below.',
    '',
    '## PROOF PDF',
    args.proofText,
    '',
    args.salesOrderText ? '## SALES ORDER PDF (supporting context)' : '',
    args.salesOrderText ?? '',
    '',
    'Now call emit_spec.',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [EMIT_TOOL] as Anthropic.Tool[],
    tool_choice: { type: 'tool', name: EMIT_TOOL.name },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Spec extractor did not call emit_spec tool');
  }
  const input = toolUse.input as Partial<SpecExtraction>;
  return {
    boardType: (input.boardType ?? null) as SpecExtraction['boardType'],
    boardSize: input.boardSize ?? null,
    material: input.material ?? null,
    background: input.background ?? null,
    graphics: input.graphics ?? null,
    fixings: input.fixings ?? null,
    style: input.style ?? null,
    boardCount: input.boardCount ?? 1,
  };
}
