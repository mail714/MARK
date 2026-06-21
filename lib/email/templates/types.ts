import type Anthropic from '@anthropic-ai/sdk';

export type BrandPalette = {
  primary: string;      // headline / heading colour
  accent: string;       // two-tone heading accent / dividers
  body: string;         // paragraph text
  link: string;         // inline link text
  buttonBg: string;     // CTA button background
  buttonBorder: string; // CTA button border
  buttonText: string;   // CTA button text
  pageBg: string;       // outer page background behind the 600px container
  cardBg: string;       // 600px container background
  footerText: string;
};

export type LibraryImage = {
  url: string;
  altText: string | null;
  sector: string | null;
  description: string | null;
};

export type TemplateRenderContext = {
  brandName: string;
  brandWebsite: string;
  brandPalette: BrandPalette;
  heroImageUrl: string | null;
  heroImageAlt: string | null;
};

export type EmailTemplate = {
  key: 'plain-text' | 'simple-hero' | 'multi-section';
  name: string;
  description: string;
  // Hint shown to operator in the brief form
  whenToUse: string;
  // Appended to the AI prompt to describe what this template needs
  promptInstructions: string;
  // dotdigital-bound emit tool definition
  emitTool: Anthropic.Tool;
  // Builds the final HTML from the model's emit_tool output + context
  render: (toolInput: Record<string, unknown>, ctx: TemplateRenderContext) => string;
  // Pulls the fields we save back onto the campaign (subject / preheader /
  // html_body) so the orchestrator stays generic across templates.
  extractFields: (toolInput: Record<string, unknown>, ctx: TemplateRenderContext) => {
    subject: string;
    preheader: string;
    html_body: string;
  };
};
