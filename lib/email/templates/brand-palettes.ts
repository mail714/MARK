import type { BrandPalette } from './types';

// Defaults derived from each brand's visual identity. Easy to override per
// brand later by editing this file — every campaign renders against these
// values on its next draft.

const NEUTRAL_FOOTER = '#6b7280';
const NEUTRAL_PAGE_BG = '#f5f5f5';

const HONOURS_BOARDS: BrandPalette = {
  // Honours boards lean traditional — dark green panel + gold lettering vibe.
  primary: '#1B3A2F',
  accent: '#C9A23A',
  body: '#1B3A2F',
  link: '#1B3A2F',
  buttonBg: '#F3F0E7',
  buttonBorder: '#1B3A2F',
  buttonText: '#1B3A2F',
  pageBg: NEUTRAL_PAGE_BG,
  cardBg: '#ffffff',
  footerText: NEUTRAL_FOOTER,
};

const SIGNET_SIGNS: BrandPalette = {
  // Trade / industrial sign work — deep blue with a signal red accent.
  primary: '#0E2240',
  accent: '#E63946',
  body: '#1f2937',
  link: '#0E2240',
  buttonBg: '#F1F1F1',
  buttonBorder: '#0E2240',
  buttonText: '#0E2240',
  pageBg: NEUTRAL_PAGE_BG,
  cardBg: '#ffffff',
  footerText: NEUTRAL_FOOTER,
};

const SIGNET_PLAY: BrandPalette = {
  // Reserved for later; if we end up running emails for Signet Play we want a
  // brighter and friendlier palette.
  primary: '#1E3A8A',
  accent: '#F59E0B',
  body: '#1f2937',
  link: '#1E3A8A',
  buttonBg: '#FEF3C7',
  buttonBorder: '#1E3A8A',
  buttonText: '#1E3A8A',
  pageBg: NEUTRAL_PAGE_BG,
  cardBg: '#ffffff',
  footerText: NEUTRAL_FOOTER,
};

const DEFAULT_PALETTE: BrandPalette = {
  primary: '#111827',
  accent: '#2a4ea0',
  body: '#1f2937',
  link: '#2a4ea0',
  buttonBg: '#F1F1F1',
  buttonBorder: '#111827',
  buttonText: '#111827',
  pageBg: NEUTRAL_PAGE_BG,
  cardBg: '#ffffff',
  footerText: NEUTRAL_FOOTER,
};

export function paletteForBrand(brandSlug: string | null | undefined): BrandPalette {
  switch (brandSlug) {
    case 'honours-boards':
      return HONOURS_BOARDS;
    case 'signet-signs':
      return SIGNET_SIGNS;
    case 'signet-play':
      return SIGNET_PLAY;
    default:
      return DEFAULT_PALETTE;
  }
}
