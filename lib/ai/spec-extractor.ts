// Use Claude to extract the canonical board spec from the proof PDF text.
// Robust to layout variations: single-board vs multi-board proofs, different
// field labels, new fields like Stain / Frame / Grain Direction. Falls back
// gracefully when fields aren't present.

import type Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_MODEL, getAnthropicClient } from './anthropic';
import {
  filterToValidClubTypes,
  HONOURS_BOARDS_CLUB_TYPES,
  type HonoursBoardsClubType,
} from './club-types';

export type SpecExtraction = {
  boardType: 'Wooden' | 'Acrylic' | 'Lettering' | null;
  boardSize: string | null;
  material: string | null;
  background: string | null;
  graphics: string | null;
  fixings: string | null;
  style: string | null;
  boardCount: number;
  clubTypes: HonoursBoardsClubType[];
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
- background: this field doubles as "back colour" in the published case study. For ACRYLIC boards it is the vinyl applied to the reverse of the panel (e.g. "Solid black vinyl to the rear"). For WOODEN boards it is the wood stain — read the proof's "Stain:" field. If the proof mentions a specific stain (e.g. "Stain 1", "Light oak", "Dark walnut", "Mahogany") use that. If the proof says "No stain" or doesn't mention a stain, write "No stain — natural oak finish" (or the equivalent for whatever timber the panel is). For lettering-only jobs leave null.
- graphics: the lettering / vinyl colour and finish (e.g. "Matt black cut vinyl", "Gold Avery 736 vinyl lettering"). Sentence case.
- fixings: how the board mounts (e.g. "Brass mirror fixings", "19mm stand-off black fixings"). Strip editorial asides like "(shown as silver so visible)".
- style: the overall description including top shape and material (e.g. "Gable top acrylic honours boards", "Flat top wooden honours board"). Sentence case. Derive from the title/section header on the proof.
- boardCount: total number of boards in the job. 1 for single-board proofs, higher for multi-board (count BOARD REF entries or read the sales-order quantity).

All text values should be sentence case, not ALL CAPS. Use null for any field genuinely absent from the source.

CLUB TYPES — pick zero or more from this controlled list based on the customer:
${HONOURS_BOARDS_CLUB_TYPES.map((c) => `- ${c}`).join('\n')}

Mapping guidance:
- School / college / sixth form / academy / university → "Schools"
- Cricket club → "Cricket"
- Golf club → "Golf"
- Tennis / lawn tennis club → "Tennis"
- Bowls / bowling club → "Bowls"
- Football / rugby / hockey clubs → match the sport
- Masonic lodge / chapter → "Masons"
- Church / chapel / cathedral / synagogue / temple → "Religious"
- Police / fire / council / armed forces / civic → "Government"
- Business / company / firm / law firm → "Corporate"
- General sports club not covered above (squash, hockey, multi-sport) → "Sports Clubs"

A customer may map to multiple tags (e.g. a school cricket club → Cricket AND Schools). Only return tags that genuinely apply. Empty list is fine if nothing fits.

Use the emit_spec tool to return the result.`;

const EMIT_TOOL = {
  name: 'emit_spec',
  description: 'Emit the canonical board spec extracted from the source PDFs.',
  input_schema: {
    type: 'object' as const,
    required: [
      'boardType',
      'boardSize',
      'material',
      'graphics',
      'fixings',
      'style',
      'boardCount',
      'clubTypes',
    ],
    properties: {
      boardType: { type: ['string', 'null'], enum: ['Wooden', 'Acrylic', 'Lettering', null] },
      boardSize: { type: ['string', 'null'] },
      material: { type: ['string', 'null'] },
      background: { type: ['string', 'null'] },
      graphics: { type: ['string', 'null'] },
      fixings: { type: ['string', 'null'] },
      style: { type: ['string', 'null'] },
      boardCount: { type: 'integer', minimum: 1 },
      clubTypes: {
        type: 'array',
        items: { type: 'string', enum: [...HONOURS_BOARDS_CLUB_TYPES] as string[] },
      },
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
    clubTypes: filterToValidClubTypes(input.clubTypes as readonly string[] | undefined),
  };
}
