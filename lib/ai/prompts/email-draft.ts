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
  heroImageUrl: string | null;
  heroImageAlt: string | null;
  libraryImages: { url: string; altText: string | null; sector: string | null }[];
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
- ONE clear primary call to action, rendered as a styled button. An optional secondary text link below is fine.
- Mobile-first: short paragraphs, scannable structure, generous white space.
- Lead with the value to the reader, not the brand's news.
- Sign off with a real name where natural.
- 150-300 words for promotional / announcement, 200-400 for newsletter.

# HTML formatting

This HTML goes into dotdigital. Use email-safe markup — inline styles only, no external CSS, no JavaScript, no flexbox or grid. Table-based layout where structure is needed (Outlook desktop still requires it).

Structure depends on campaign type:

NEWSLETTER:
- Hero image at the top (full-width 600px placeholder)
- Two or three sections each with a small H2 heading + a paragraph + inline link
- One primary CTA button to the brand website
- Sign-off paragraph

PROMOTIONAL:
- Hero image at the top
- One strong opening paragraph
- One supporting paragraph
- One clearly-visible CTA button
- Optional sub-line with a softer secondary link

ANNOUNCEMENT:
- Short and sharp — hero image optional
- 1-2 paragraphs of news
- Single CTA button

# Email-safe HTML patterns to use

Container wrapper (always wrap the entire body in this):
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff; max-width:600px;">
      <tr><td style="padding:24px;">

      [content goes here]

      </td></tr>
    </table>
  </td></tr>
</table>

Hero image (use a placeholder URL with an obvious CHANGE-ME marker so the operator can spot it and swap in the real image before pushing):
<img src="https://CHANGE-ME.example.com/hero.jpg" alt="[descriptive alt text]" width="600" style="display:block; width:100%; max-width:600px; height:auto; border:0;" />

H2 section heading:
<h2 style="margin:24px 0 8px 0; font-family: Arial, sans-serif; font-size: 20px; line-height: 1.3; color:#222;">…</h2>

Paragraph:
<p style="margin: 0 0 12px 0; font-family: Arial, sans-serif; font-size: 15px; line-height: 1.5; color:#222;">…</p>

Inline link:
<a href="https://…" style="color: #2a4ea0; text-decoration: underline;">anchor text</a>

Bold inside paragraphs:
<strong>…</strong>

Primary CTA button (table-based so it survives Outlook):
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 16px 0;">
  <tr>
    <td style="background:#2a4ea0; border-radius: 4px;">
      <a href="https://…" style="display:inline-block; padding:12px 24px; color:#ffffff; font-family: Arial, sans-serif; font-size: 15px; font-weight: bold; text-decoration: none;">Read the full case study</a>
    </td>
  </tr>
</table>

Footer paragraph (always include; do NOT add an unsubscribe link — dotdigital appends one automatically):
<p style="margin: 24px 0 0 0; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; color:#777;">
  Signet Signs Ltd, Unit 3 Windmill Business Park, Clevedon, BS21 6SR. <a href="https://[brand-domain]" style="color:#777; text-decoration:underline;">Visit the website</a>
</p>

# Images

The brief tells you the exact hero image URL and alt text to use. Use them verbatim in the hero \`<img>\` tag. Do not invent your own image URLs and do not use placeholder URLs like CHANGE-ME.example.com.

If the brief says NO HERO IMAGE, omit the hero entirely and lead with the opening paragraph instead.

For supporting inline images (rare), the same rule applies: the brief will list available image URLs or say none are available. Do not invent.

# Brand styling cues

The CTA button colour above (#2a4ea0) is a sensible neutral default. Do not invent brand colours you weren't told. If the brand context names a specific accent in the brief, use it; otherwise leave the default.

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

import type { EmailTemplate } from '@/lib/email/templates';

export async function buildUserMessage(
  ctx: EmailDraftContext,
  template: EmailTemplate,
): Promise<string> {
  const lines: string[] = [];

  // Template-specific structural instructions go first so the model knows
  // what shape of content to produce.
  lines.push('# Template');
  lines.push(`Selected template: ${template.name}`);
  lines.push(template.promptInstructions);
  lines.push('');

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

  lines.push('');
  if (ctx.heroImageUrl) {
    lines.push(
      `Hero image URL (use this exact URL in the hero <img> src): ${ctx.heroImageUrl}`,
    );
    lines.push(
      `Hero image alt text (use this exact alt text in the hero <img> alt): ${ctx.heroImageAlt ?? ''}`,
    );
  } else {
    lines.push('NO HERO IMAGE: skip the hero entirely. Open with the first paragraph.');
  }

  if (ctx.intent) {
    lines.push('', `Intent / what to write about:`, ctx.intent);
  } else {
    lines.push(
      '',
      'Intent: no specific brief — write a sensible default for this brand + sector + campaign type combination.',
    );
  }

  if (ctx.libraryImages.length > 0) {
    lines.push(
      '',
      '## Image library — pick image URLs verbatim from this list, do not invent or alter URLs',
    );
    for (const img of ctx.libraryImages.slice(0, 60)) {
      const sector = img.sector ? `[${img.sector}] ` : '';
      lines.push(`- ${sector}${img.url} — ${img.altText ?? '(no alt text)'}`);
    }
  }

  lines.push('', `Now call ${template.emitTool.name} with the structure described above.`);

  return lines.join('\n');
}

export type ToolSchema = Anthropic.Tool;
