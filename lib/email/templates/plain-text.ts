import {
  footer,
  paragraph,
  signoff,
  wrapBody,
} from './common';
import type { EmailTemplate } from './types';

export const plainTextTemplate: EmailTemplate = {
  key: 'plain-text',
  name: 'Plain text',
  description: 'Image-free letter style — paragraphs and one text CTA.',
  whenToUse: 'When you want to land in inboxes where images are blocked, or for short personal-feeling messages.',
  promptInstructions: `Output a plain text email. No images, no buttons, no headings. Just paragraphs separated by blank lines and a single text-style closing call-to-action at the end. Keep it 100-200 words.`,
  emitTool: {
    name: 'emit_email_plaintext',
    description: 'Emit a plain-text style email.',
    input_schema: {
      type: 'object',
      required: ['subject', 'preheader', 'body', 'signoff', 'cta_text', 'cta_url'],
      properties: {
        subject: { type: 'string', description: 'Plain-text subject, 30–50 chars.' },
        preheader: { type: 'string', description: 'Inbox preview text, 80–110 chars.' },
        body: {
          type: 'string',
          description:
            'Email body as plain text. Use blank lines to separate paragraphs. No HTML, no images, no buttons.',
        },
        signoff: {
          type: 'string',
          description: 'Closing line like "Thanks, the [Brand] team".',
        },
        cta_text: { type: 'string', description: 'Closing call-to-action wording.' },
        cta_url: {
          type: 'string',
          description: 'URL the closing CTA should point at — usually the brand website.',
        },
      },
    },
  },
  extractFields(toolInput, ctx) {
    const subject = String(toolInput.subject ?? '');
    const preheader = String(toolInput.preheader ?? '');
    const body = String(toolInput.body ?? '');
    const so = String(toolInput.signoff ?? '');
    const ctaText = String(toolInput.cta_text ?? '');
    const ctaUrl = String(toolInput.cta_url ?? '');

    const html = wrapBody(
      [
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:24px;">&nbsp;</td></tr></table>`,
        paragraph(body, ctx.brandPalette),
        paragraph(so, ctx.brandPalette),
        paragraph(
          `<a href="${ctaUrl}" style="color:${ctx.brandPalette.link}; text-decoration:underline; font-weight:bold;">${ctaText}</a>`,
          ctx.brandPalette,
        ),
        footer(ctx),
      ].join('\n'),
      ctx,
    );
    return { subject, preheader, html_body: html };
  },
  render(toolInput, ctx) {
    return this.extractFields(toolInput, ctx).html_body;
  },
};
