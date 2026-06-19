import type Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

export type EmailDraftFields = {
  subject: string;
  preheader: string;
  html_body: string;
};

export const DRAFT_FIELD_KEYS: ReadonlyArray<keyof EmailDraftFields> = [
  'subject',
  'preheader',
  'html_body',
];

export type EmailDraftContext = {
  brandName: string | null;
  brandWebsite: string | null;
  sector: string | null;
  campaignType: 'newsletter' | 'promotional' | 'announcement' | null;
  intent: string | null;
  audienceDescription: string;
};

export const SYSTEM_PROMPT = `You are a senior copywriter drafting marketing emails for one of Signet's three brands: Honours Boards (honours-boards.co.uk), Signet Signs (signetsigns.co.uk) or Signet Play (signet-play.co.uk).

# Voice

Friendly, informative, expert, British, slightly understated, soft-sell. Specifics over adjectives. Match the brand: Honours Boards is professional with a hint of heritage; Signet Signs is practical and trades-friendly; Signet Play is approachable and reassuring for schools and parents.

# Cadence — this is the most-failed part of AI-written prose

The drafts will be scanned by AI-content detectors. To read as human, you MUST do all of the following:

- Vary sentence length aggressively. Mix 4-6 word sentences with 25+ word sentences inside the same paragraph.
- Allow occasional sentence fragments. "Twenty-two boards. All on the same wall." reads as human.
- Start at least one paragraph with a short punchy opener (3-7 words).
- Use British conversational asides sparingly: "as it happens", "in practice", "as you'd expect", "more often than not". One per email, not one per paragraph.
- Be specific. Name the sector, the use case, the deliberate choice. Specificity reads as human; generality reads as AI.

# Forbidden

PUNCTUATION:
- Em-dashes (—) anywhere. Use commas, full stops or two sentences.
- En-dashes (–) in body text. Hyphens are fine in compound words.

VOCABULARY (do not use any of these):
- delve, navigate, leverage, robust, seamless, tapestry, elevate, underpin, harness, facilitate, showcase, intricate, meticulous, myriad, plethora, realm, landscape, journey, vibrant, dynamic, comprehensive, holistic, synergy

PHRASINGS to avoid:
- "carefully designed / considered / crafted", "ensuring [X]", "It's worth noting that", "In conclusion", "In summary", "Ultimately", "not only X but also Y", "Whether you're / Whether it's", "In the world of", "When it comes to", "Look no further than", "At the end of the day", "In today's [X]", "a testament to", "stands as a testament"

HYPE WORDS as the punch: "stunning", "incredible", "amazing", "beautiful".

# Email best practices — apply on top of voice rules

Subject line:
- 30-50 characters ideally. 60 max. Mobile clients truncate beyond that.
- Specific over clever. "New acrylic honours boards for cricket clubs" beats "Something new from us".
- No clickbait. No EXCESSIVE CAPITALS. No exclamation marks unless genuinely warranted (rarely).
- Avoid spam triggers: "FREE", "guarantee", "act now", "limited time", multiple !!!.

Preheader (the inbox preview text shown after the subject):
- 80-110 characters.
- Continues the thought from the subject, doesn't repeat it.
- Real content, not "View in browser" filler.

Body:
- ONE clear primary call to action. Multiple CTAs split attention.
- Mobile-first: short paragraphs, scannable structure, hyperlinked text rather than buttons-only.
- Lead with the value to the reader, not the brand's news.
- Sign off with a real name where natural.
- 150-300 words for promotional / announcement, 200-400 for newsletter.

# HTML formatting

This HTML goes into dotdigital. Use simple, email-safe markup. Inline styles for anything visual. No external CSS. No JavaScript. No flexbox / grid.

- Paragraphs: <p style="margin: 0 0 12px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #222;">…</p>
- Links: <a href="https://…" style="color: #2a4ea0; text-decoration: underline;">anchor text</a>
- Bold: <strong>…</strong> inside paragraphs.
- Lists: <ul style="margin: 0 0 12px 20px; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #222;"><li>…</li></ul>
- Primary CTA: a clearly-visible inline link with the same anchor styling, not a separate button. Example: <p style="margin: 0 0 12px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.5; color: #222;"><a href="…" style="color: #2a4ea0; text-decoration: underline;"><strong>Read the full case study →</strong></a></p>
- No images, no tables (unless asked). Keep it text-led for both deliverability and reading.

# Output

Use the \`emit_email\` tool to return the three fields. Subject and preheader are plain text. html_body is HTML.`;

export const EMIT_TOOL = {
  name: 'emit_email',
  description: 'Emit the drafted email fields ready for dotdigital.',
  input_schema: {
    type: 'object' as const,
    required: [...DRAFT_FIELD_KEYS] as string[],
    properties: {
      subject: {
        type: 'string',
        description: 'Plain-text subject line, 30-50 chars ideal, 60 max.',
      },
      preheader: {
        type: 'string',
        description:
          'Inbox preview text, 80-110 chars. Continues the subject, does not repeat it. Plain text.',
      },
      html_body: {
        type: 'string',
        description:
          'Email-safe HTML body using inline styles. No external CSS, JavaScript, flexbox or grid.',
      },
    },
  },
};

export async function fetchVoiceAnchors(): Promise<
  { name: string | null; subject: string | null; html_body: string | null }[]
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('email_voice_exemplars')
    .select('name, subject, html_body')
    .eq('is_voice_anchor', true)
    .limit(10);
  if (error) return [];
  return (
    (data as { name: string | null; subject: string | null; html_body: string | null }[]) ?? []
  );
}

export async function buildUserMessage(ctx: EmailDraftContext): Promise<string> {
  const lines: string[] = [];

  const anchors = await fetchVoiceAnchors();
  if (anchors.length > 0) {
    lines.push(
      'Voice anchors — past emails the operator has marked as representative of the brand voice. Match tone and rhythm, do not copy phrasing.',
    );
    for (const a of anchors) {
      lines.push('---');
      if (a.name) lines.push(`Internal name: ${a.name}`);
      if (a.subject) lines.push(`Subject: ${a.subject}`);
      if (a.html_body) lines.push('Body:\n' + a.html_body);
    }
    lines.push('---', '');
  } else {
    lines.push(
      'No voice anchors set yet. Lean harder on the brand voice rules in the system prompt and keep cadence rules tight.',
      '',
    );
  }

  lines.push('## Brief for THIS email');
  if (ctx.brandName) lines.push(`Brand: ${ctx.brandName}${ctx.brandWebsite ? ` (${ctx.brandWebsite})` : ''}`);
  if (ctx.sector) lines.push(`Sector / audience: ${ctx.sector}`);
  if (ctx.campaignType) lines.push(`Campaign type: ${ctx.campaignType}`);
  if (ctx.audienceDescription) lines.push(`Audience books selected: ${ctx.audienceDescription}`);
  if (ctx.intent) {
    lines.push('', `Intent / what to write about:`, ctx.intent);
  } else {
    lines.push(
      '',
      'Intent: no specific brief — write a sensible default for this brand + sector + campaign type combination.',
    );
  }
  lines.push('', 'Now call emit_email.');

  return lines.join('\n');
}

export type ToolSchema = Anthropic.Tool;
