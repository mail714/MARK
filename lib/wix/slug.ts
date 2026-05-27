// Generate a clean URL slug from a case-study title.
// Wix auto-generates a slug from the title field, but its default produces
// URL-encoded em-dashes (%E2%80%93) and retains apostrophes. This version is
// lowercase, ASCII-only, with hyphens for separators.

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'of', 'for']);

export function buildCaseStudySlug(title: string): string {
  // 1. Normalise unicode dashes / apostrophes to plain ASCII
  let s = title
    .replace(/[–—−]/g, '-') // en, em, minus
    .replace(/[‘’‚‛]/g, '') // smart single quotes
    .replace(/[“”]/g, '') // smart double quotes
    .replace(/['´`]/g, '') // straight + back ticks
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, ''); // strip combining accents

  // 2. Lowercase
  s = s.toLowerCase();

  // 3. Anything not [a-z0-9] becomes a separator
  s = s.replace(/[^a-z0-9]+/g, '-');

  // 4. Drop leading/trailing separators and collapse runs
  s = s.replace(/^-+|-+$/g, '').replace(/-+/g, '-');

  // 5. Drop stop-words for brevity (only if it'd still leave a meaningful slug)
  const parts = s.split('-').filter(Boolean);
  const trimmed = parts.filter((p) => !STOP_WORDS.has(p));
  if (trimmed.length >= 3) s = trimmed.join('-');

  return s;
}

// The Wix link field stores the full path, e.g. '/product/bishop-stortford-...'.
export function caseStudySlugPath(title: string): string {
  return `/product/${buildCaseStudySlug(title)}`;
}
