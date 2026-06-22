// Calendar-friendly colour swatch per brand. Distinct from the email
// templates' inline-style palette because Tailwind classes work better in
// the UI and we want the calendar entries to read clearly at a glance.

export type BrandSwatch = {
  border: string;     // left-border accent
  bg: string;         // tinted background
  badge: string;      // brand label pill
  badgeText: string;
};

const SWATCHES: Record<string, BrandSwatch> = {
  'honours-boards': {
    border: 'border-l-emerald-700',
    bg: 'bg-emerald-50',
    badge: 'bg-emerald-100 ring-emerald-200',
    badgeText: 'text-emerald-900',
  },
  'signet-signs': {
    border: 'border-l-blue-700',
    bg: 'bg-blue-50',
    badge: 'bg-blue-100 ring-blue-200',
    badgeText: 'text-blue-900',
  },
  'signet-play': {
    border: 'border-l-amber-600',
    bg: 'bg-amber-50',
    badge: 'bg-amber-100 ring-amber-200',
    badgeText: 'text-amber-900',
  },
};

const DEFAULT: BrandSwatch = {
  border: 'border-l-neutral-400',
  bg: 'bg-neutral-50',
  badge: 'bg-neutral-100 ring-neutral-200',
  badgeText: 'text-neutral-700',
};

export function swatchForBrand(brandSlug: string | null | undefined): BrandSwatch {
  if (!brandSlug) return DEFAULT;
  return SWATCHES[brandSlug] ?? DEFAULT;
}
