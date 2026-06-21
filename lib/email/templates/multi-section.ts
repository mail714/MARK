import {
  ctaButton,
  divider,
  escapeHtml,
  footer,
  heroImage,
  paragraph,
  richBody,
  sectionImage,
  signoff,
  twoToneHeading,
  wrapBody,
} from './common';
import type { EmailTemplate } from './types';

// Newsletter-style template inspired by the Topaz layout the operator
// referenced: hero + opening, then a series of titled sections each with
// their own image, ending with a sign-off + closing CTA + footer.
//
// Per-section thumbnail row and main+sub-image grid from the reference are
// not in this first pass — single-image-per-section keeps the AI's image
// picking job tractable. We can add those rows once the structure is in
// production and we know what's lacking.

export const multiSectionTemplate: EmailTemplate = {
  key: 'multi-section',
  name: 'Multi-section newsletter',
  description: 'Hero + opening + 2–4 sections each with a two-tone heading and image + closing CTA.',
  whenToUse: 'Monthly newsletters and round-ups with multiple stories to tell.',
  promptInstructions: `The email opens with a hero image (URL supplied in the brief) and an opening paragraph. Then 2-4 sections follow, each with:
- A two-part heading. First part is the topic (rendered in the brand accent colour), second part is a short category label like "PROJECTS", "EVENTS", "BEHIND THE SCENES" (rendered in dark).
- 1-3 paragraphs of body text.
- A section image URL — pick from the supplied image library list; do not invent URLs.
- Optionally a CTA button for that section.

End with a closing paragraph, a sign-off, and a final CTA button.

Match the brand voice and cadence rules from the system prompt. Body fields should be HTML using only <p> tags styled with margin:0 0 16px 0; font-family:Arial, sans-serif; font-size:15px; line-height:1.7; and inline links where natural.`,
  emitTool: {
    name: 'emit_email_multisection',
    description: 'Emit a multi-section newsletter email.',
    input_schema: {
      type: 'object',
      required: [
        'subject',
        'preheader',
        'opening_body_html',
        'sections',
        'closing_body_html',
        'signoff',
        'closing_cta_text',
        'closing_cta_url',
      ],
      properties: {
        subject: { type: 'string', description: 'Subject, 30–50 chars.' },
        preheader: { type: 'string', description: 'Preview text, 80–110 chars.' },
        opening_body_html: {
          type: 'string',
          description: '1-2 <p> tags introducing the issue / sitting after the hero.',
        },
        sections: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          description: 'The repeating story sections.',
          items: {
            type: 'object',
            required: ['title_topic', 'title_category', 'body_html', 'image_url', 'image_alt'],
            properties: {
              title_topic: { type: 'string', description: 'Topic line, e.g. "PORSCHE CLUB GB X TOPAZ BRISTOL". Rendered in brand accent.' },
              title_category: { type: 'string', description: 'Short category tag, e.g. "EVENTS" or "PROJECTS". Rendered in dark.' },
              body_html: { type: 'string', description: '1-3 <p> tags for this section.' },
              image_url: { type: 'string', description: 'URL of the section image — choose from the supplied image library list.' },
              image_alt: { type: 'string', description: 'Alt text for the section image.' },
              cta_text: { type: ['string', 'null'], description: 'Section CTA label, optional.' },
              cta_url: { type: ['string', 'null'], description: 'Section CTA URL, optional.' },
            },
          },
        },
        closing_body_html: { type: 'string', description: '1-2 <p> tags wrapping up the newsletter.' },
        signoff: { type: 'string', description: '"Thanks for reading, the Honours Boards team" style.' },
        closing_cta_text: { type: 'string', description: 'Closing CTA button label.' },
        closing_cta_url: { type: 'string', description: 'Closing CTA destination URL.' },
      },
    },
  },
  extractFields(toolInput, ctx) {
    const subject = String(toolInput.subject ?? '');
    const preheader = String(toolInput.preheader ?? '');
    const openingHtml = String(toolInput.opening_body_html ?? '');
    const sections = Array.isArray(toolInput.sections) ? (toolInput.sections as Record<string, unknown>[]) : [];
    const closingHtml = String(toolInput.closing_body_html ?? '');
    const so = String(toolInput.signoff ?? '');
    const closingCtaText = String(toolInput.closing_cta_text ?? '');
    const closingCtaUrl = String(toolInput.closing_cta_url ?? '');
    const p = ctx.brandPalette;

    const parts: string[] = [];
    if (ctx.heroImageUrl) parts.push(heroImage(ctx.heroImageUrl, ctx.heroImageAlt));
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:16px;">&nbsp;</td></tr></table>`);
    parts.push(richBody(openingHtml));

    for (const s of sections) {
      const topic = String(s.title_topic ?? '');
      const category = String(s.title_category ?? '');
      const bodyHtml = String(s.body_html ?? '');
      const imgUrl = String(s.image_url ?? '');
      const imgAlt = s.image_alt == null ? null : String(s.image_alt);
      const sCtaText = s.cta_text == null ? null : String(s.cta_text);
      const sCtaUrl = s.cta_url == null ? null : String(s.cta_url);

      parts.push(divider(p));
      parts.push(twoToneHeading(topic, category, p));
      parts.push(richBody(bodyHtml));
      if (imgUrl) parts.push(sectionImage(imgUrl, imgAlt));
      if (sCtaText && sCtaUrl) parts.push(ctaButton(sCtaText, sCtaUrl, p));
    }

    parts.push(divider(p));
    parts.push(richBody(closingHtml));
    parts.push(signoff(so, p));
    parts.push(ctaButton(closingCtaText, closingCtaUrl, p));
    parts.push(footer(ctx));

    return {
      subject,
      preheader,
      html_body: wrapBody(parts.join('\n'), ctx),
    };
  },
  render(toolInput, ctx) {
    return this.extractFields(toolInput, ctx).html_body;
  },
};
