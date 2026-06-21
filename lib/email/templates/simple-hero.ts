import {
  ctaButton,
  footer,
  heroImage,
  richBody,
  signoff,
  wrapBody,
} from './common';
import type { EmailTemplate } from './types';

export const simpleHeroTemplate: EmailTemplate = {
  key: 'simple-hero',
  name: 'Simple hero',
  description: 'Single hero image, one body, one CTA button.',
  whenToUse: 'Fast one-shot promos and announcements. Single piece of news + one clear action.',
  promptInstructions: `The email has a single hero image at the top (URL supplied in the brief), then 2-3 paragraphs of body text, then a single primary CTA button. End with a sign-off line.

For the body HTML use only <p> tags styled with margin:0 0 16px 0; font-family:Arial, sans-serif; font-size:15px; line-height:1.7; and the brand body colour. Inline links use the brand link colour.`,
  emitTool: {
    name: 'emit_email_simple_hero',
    description: 'Emit a simple hero-style email.',
    input_schema: {
      type: 'object',
      required: ['subject', 'preheader', 'body_html', 'cta_text', 'cta_url', 'signoff'],
      properties: {
        subject: { type: 'string', description: 'Subject, 30–50 chars.' },
        preheader: { type: 'string', description: 'Preview text, 80–110 chars.' },
        body_html: {
          type: 'string',
          description: 'Body HTML: 2-3 <p> tags. No images, no buttons; the renderer adds those.',
        },
        cta_text: { type: 'string', description: 'CTA button label, 3-6 words.' },
        cta_url: { type: 'string', description: 'CTA destination URL.' },
        signoff: { type: 'string', description: 'Sign-off, e.g. "Thanks, the Honours Boards team".' },
      },
    },
  },
  extractFields(toolInput, ctx) {
    const subject = String(toolInput.subject ?? '');
    const preheader = String(toolInput.preheader ?? '');
    const bodyHtml = String(toolInput.body_html ?? '');
    const ctaText = String(toolInput.cta_text ?? '');
    const ctaUrl = String(toolInput.cta_url ?? '');
    const so = String(toolInput.signoff ?? '');

    const parts: string[] = [];
    if (ctx.heroImageUrl) parts.push(heroImage(ctx.heroImageUrl, ctx.heroImageAlt));
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:16px;">&nbsp;</td></tr></table>`);
    parts.push(richBody(bodyHtml));
    parts.push(ctaButton(ctaText, ctaUrl, ctx.brandPalette));
    parts.push(signoff(so, ctx.brandPalette));
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
