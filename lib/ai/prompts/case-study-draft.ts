import type { ExtractedSpec } from '@/lib/pdf/extract';
import type { CaseStudy } from '@/lib/types';
import { EXEMPLARS } from '@/lib/ai/exemplars';

export type DraftFields = {
  h1_page_title: string;
  h1_introduction_text: string;
  h2_design_highlights_title: string;
  h2_design_highlights_text: string;
  h2_summary_title: string;
  h2_summary_text: string;
  cta_text: string;
  page_meta_title: string;
  page_meta_description: string;
  schema_title: string;
  schema_desc: string;
};

export const DRAFT_FIELD_KEYS: ReadonlyArray<keyof DraftFields> = [
  'h1_page_title',
  'h1_introduction_text',
  'h2_design_highlights_title',
  'h2_design_highlights_text',
  'h2_summary_title',
  'h2_summary_text',
  'cta_text',
  'page_meta_title',
  'page_meta_description',
  'schema_title',
  'schema_desc',
];

export const SYSTEM_PROMPT = `You are a senior copywriter for Signet's Honours Boards brand. You write case studies that are published at https://www.honours-boards.co.uk. The brand has produced bespoke honours boards in the UK for decades — sports clubs, schools, masonic lodges, military, university — and the case study site is a long-running portfolio that doubles as a soft sales engine.

# Voice

Friendly, informative, expert, British, slightly understated, soft-sell. Never pushy. Never generic. Confident from experience. Specifics over adjectives. Every sentence should add a concrete detail or move the narrative forward.

# Structural pattern (consistent across all existing case studies)

- **Introduction**: opens with the customer or their problem, not with us. Establishes what they needed. 120–180 words.
- **Design Highlights**: the technical / craft section. Specifics in bold inline — material, dimensions, finish, lettering, fixings, layout choices. May include exactly one internal link to a relevant category page. 150–250 words.
- **Summary**: zooms out — the wider point about this type of project, our experience with similar work, and a soft pitch. 150–250 words.
- **CTA**: one or two sentences inviting contact.

# Recurring opening patterns (draw from, do not copy)

- "When a [type of] club commissions a new honours board, it is rarely just about adding names to a wall."
- "[Customer] required a bespoke honours board to record..."
- "[Customer] wanted to refresh and rebrand their clubhouse..."
- "Not every cricket honours board needs to follow the usual format..."

# Recurring phrasings

- "We designed and manufactured..."
- "We worked closely with the club..."
- "This board was produced from..."
- "For [type of] clubs in particular..."
- "If you're planning..." / "If you are looking for..."
- "get in touch"

# Forbidden — do not use these

Hype words: "stunning", "incredible", "amazing", "beautiful" (sparingly is fine — never as the punch).
Generic AI tells: "In the world of...", "When it comes to...", "Look no further than...", "Whether you're...", "Whether it's...".
Padding ("at the end of the day", "in today's...").
Repeating the customer name more than 3 times across the whole body.
Mentioning price, timescales, warranty, or process claims unless they are in the source spec.

# HTML formatting

Body text fields contain HTML formatted to match Wix Studio's editor output. Use exactly these patterns:

Paragraphs:
<p class="font_8">Paragraph text here.</p>

Blank line / spacer between paragraphs:
<p class="font_8"><br></p>

Bold for inline specifications:
<p class="font_8">The board was made at <strong>1200 × 600mm</strong> with a <strong>solid oak frame</strong>.</p>

Internal links — always bold AND underlined:
<a href="https://www.honours-boards.co.uk/wooden-honours-boards"><u><strong>wooden honours boards</strong></u></a>

Standard internal-link targets you may use (pick at most one or two, only when natural):
- https://www.honours-boards.co.uk/wooden-honours-boards
- https://www.honours-boards.co.uk/acrylic-honours-boards
- https://www.honours-boards.co.uk/honours-board-lettering
- https://www.honours-boards.co.uk/honours-board-examples

Unordered list:
<ul class="font_8"><li><p class="font_8">First item</p></li></ul>

# Output

Use the \`emit_case_study\` tool to return the draft. All eleven fields are required. Body fields are HTML strings as described above. Title fields are plain text (no HTML).

Total word count across the three body sections combined should be roughly 500–800 words. Page meta title around 60 characters. Page meta description around 150–160 characters. SchemaDesc around 30–40 words.`;

function fmtSpec(spec: ExtractedSpec): string {
  const lines: string[] = [];
  if (spec.customerName) lines.push(`Customer: ${spec.customerName}`);
  if (spec.customerBrief) lines.push(`Brief: ${spec.customerBrief}`);
  if (spec.boardType) lines.push(`Board type: ${spec.boardType}`);
  if (spec.style) lines.push(`Style: ${spec.style}`);
  if (spec.boardSize) lines.push(`Board size: ${spec.boardSize}`);
  if (spec.boardCount > 1) lines.push(`Quantity: ${spec.boardCount} boards`);
  if (spec.material) lines.push(`Material: ${spec.material}`);
  if (spec.background) lines.push(`Background: ${spec.background}`);
  if (spec.graphics) lines.push(`Graphics: ${spec.graphics}`);
  if (spec.fixings) lines.push(`Fixings: ${spec.fixings}`);
  if (spec.orderDate) lines.push(`Order date: ${spec.orderDate}`);
  if (spec.salesOrder?.items.length) {
    lines.push('Sales-order line items:');
    for (const it of spec.salesOrder.items) {
      const dim = it.width && it.height ? ` (${it.width} × ${it.height})` : '';
      lines.push(`  - ${it.name}${dim} × ${it.qty ?? '?'}`);
    }
  }
  return lines.join('\n');
}

function fmtExemplars(): string {
  if (EXEMPLARS.length === 0) return '';
  const parts: string[] = ['Reference case studies. These are real published examples of the brand voice; do not copy phrasing wholesale, but match tone, structure, and level of specificity.\n'];
  for (const ex of EXEMPLARS) {
    parts.push(`---\nCustomer: ${ex.customer} (${ex.tag})\n`);
    parts.push(`Introduction:\n${ex.introduction}\n`);
    parts.push(`Design Highlights:\n${ex.designHighlights}\n`);
    parts.push(`Summary:\n${ex.summary}\n`);
    parts.push(`CTA:\n${ex.cta}\n`);
  }
  return parts.join('\n');
}

export function buildUserMessage(
  spec: ExtractedSpec,
  caseStudy: Pick<CaseStudy, 'club_types' | 'customer_name'>,
): string {
  const clubTypes = caseStudy.club_types.length
    ? `Club type tags (use for sector cues only — do not enumerate in prose): ${caseStudy.club_types.join(', ')}`
    : 'Club type tags: (none set — infer sector from spec)';

  const sections = [
    fmtExemplars(),
    '## Job to write up\n',
    fmtSpec(spec),
    '',
    clubTypes,
    '',
    'Draft the full case study now. Return via the emit_case_study tool.',
  ].filter(Boolean);

  return sections.join('\n');
}

export const EMIT_TOOL = {
  name: 'emit_case_study',
  description: 'Emit the eleven case-study fields ready for the Wix CMS.',
  input_schema: {
    type: 'object' as const,
    required: [...DRAFT_FIELD_KEYS] as string[],
    properties: {
      h1_page_title: { type: 'string', description: 'Page H1, e.g. "Thorpe Willoughby CC – Cricket Honours Boards". Plain text.' },
      h1_introduction_text: { type: 'string', description: 'Opening narrative HTML (~120–180 words).' },
      h2_design_highlights_title: { type: 'string', description: 'Section H2 for Design Highlights. Plain text.' },
      h2_design_highlights_text: { type: 'string', description: 'Design Highlights body HTML (~150–250 words).' },
      h2_summary_title: { type: 'string', description: 'Section H2 for Summary. Plain text.' },
      h2_summary_text: { type: 'string', description: 'Summary body HTML (~150–250 words).' },
      cta_text: { type: 'string', description: 'CTA HTML, one or two sentences.' },
      page_meta_title: { type: 'string', description: 'SEO title, ~60 characters.' },
      page_meta_description: { type: 'string', description: 'SEO meta description, ~150–160 characters.' },
      schema_title: { type: 'string', description: 'Short structured-data title.' },
      schema_desc: { type: 'string', description: 'Structured-data description, ~30–40 words.' },
    },
  },
} as const;
