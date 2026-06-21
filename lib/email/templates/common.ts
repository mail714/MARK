import type { BrandPalette, TemplateRenderContext } from './types';

// Helpers for assembling email-safe HTML. All use inline styles only; no
// flexbox, no grid, no external CSS, no JavaScript. Tables for any layout
// structure so Outlook desktop renders correctly.

const ARIAL = 'Arial, Helvetica, sans-serif';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function wrapBody(inner: string, ctx: TemplateRenderContext): string {
  const p = ctx.brandPalette;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${p.pageBg};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:${p.cardBg}; max-width:600px;">
      <tr><td style="padding:0;">
${inner}
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

export function paragraph(html: string, p: BrandPalette, paddingX = 24): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 ${paddingX}px;">${html
    .split(/\n\n+/)
    .map((para) =>
      para.trim()
        ? `<p style="margin:0 0 16px 0; font-family:${ARIAL}; font-size:15px; line-height:1.7; color:${p.body};">${para.trim()}</p>`
        : '',
    )
    .filter(Boolean)
    .join('\n')}</td></tr></table>`;
}

// Pass-through for AI-generated HTML body content. The AI is constrained to
// well-formed paragraphs and links, so we don't sanitise further here.
export function richBody(html: string, paddingX = 24): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 ${paddingX}px;">${html}</td></tr></table>`;
}

export function heroImage(url: string, alt: string | null): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0;"><img src="${url}" alt="${escapeHtml(alt ?? '')}" width="600" style="display:block; width:100%; max-width:600px; height:auto; border:0;" /></td></tr></table>`;
}

export function sectionImage(url: string, alt: string | null): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:8px 0;"><img src="${url}" alt="${escapeHtml(alt ?? '')}" width="600" style="display:block; width:100%; max-width:600px; height:auto; border:0;" /></td></tr></table>`;
}

export function ctaButton(text: string, url: string, p: BrandPalette): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:16px auto; border-collapse:separate;">
  <tr><td style="background:${p.buttonBg}; border:1px solid ${p.buttonBorder}; border-radius:13px;">
    <a href="${url}" style="display:inline-block; padding:12px 24px; color:${p.buttonText}; font-family:${ARIAL}; font-size:15px; font-weight:bold; text-decoration:none;">${escapeHtml(text)}</a>
  </td></tr>
</table>`;
}

export function twoToneHeading(topic: string, category: string, p: BrandPalette): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:24px 24px 0; text-align:center;">
  <h1 style="margin:0; font-family:${ARIAL}; font-size:24px; line-height:1.4; color:${p.accent}; font-weight:normal;">${escapeHtml(topic)}</h1>
  <h1 style="margin:4px 0 0 0; font-family:${ARIAL}; font-size:24px; line-height:1.4; color:${p.primary}; font-weight:bold;">/ ${escapeHtml(category)}</h1>
</td></tr></table>`;
}

export function divider(p: BrandPalette): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 0;">
  <table role="presentation" width="75%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${p.body}; font-size:0; line-height:0;">&nbsp;</td></tr></table>
</td></tr></table>`;
}

export function footer(ctx: TemplateRenderContext): string {
  const p = ctx.brandPalette;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:24px; text-align:center;">
  <p style="margin:0 0 4px 0; font-family:${ARIAL}; font-size:12px; line-height:1.5; color:${p.footerText};">${escapeHtml(ctx.brandName)} · Unit 3 Windmill Business Park, Clevedon BS21 6SR</p>
  <p style="margin:0; font-family:${ARIAL}; font-size:12px; line-height:1.5; color:${p.footerText};"><a href="${ctx.brandWebsite}" style="color:${p.footerText}; text-decoration:underline;">${ctx.brandWebsite.replace(/^https?:\/\//, '')}</a></p>
</td></tr></table>`;
}

export function signoff(text: string, p: BrandPalette): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px 24px 0;">
  <p style="margin:0; font-family:${ARIAL}; font-size:15px; line-height:1.7; color:${p.body};">${escapeHtml(text)}</p>
</td></tr></table>`;
}
