// Voice-grounding examples drawn from existing case studies on
// honours-boards.co.uk. The AI prompt stitches these in as in-context
// reference material so generated drafts match the established brand voice.
//
// To add or update an exemplar:
// 1. Browse to a published case study on https://www.honours-boards.co.uk
// 2. Copy the body text of the Intro / Design Highlights / Summary / CTA
//    sections (plain text, no HTML — the prompt re-applies the Wix HTML
//    formatting itself).
// 3. Add an entry below with a short `tag` describing the sector.

export type Exemplar = {
  tag: string;             // 'cricket', 'school', 'masonic', etc.
  customer: string;        // Customer / club name
  introduction: string;    // Intro paragraph(s)
  designHighlights: string;
  summary: string;
  cta: string;
};

export const EXEMPLARS: Exemplar[] = [];

export function hasExemplars(): boolean {
  return EXEMPLARS.length >= 2;
}
