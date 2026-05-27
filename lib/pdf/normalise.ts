// Normalise extracted PDF strings into consistent sentence-case prose.
// Source PDFs mix ALL-CAPS headings with sentence-case values. For human
// review and downstream AI prompting we want everything in a consistent voice.

// True if the string is predominantly uppercase letters.
function isShouty(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.7;
}

// Convert ALL CAPS to "First letter capitalised, rest lowercase".
// Preserves digits, punctuation, and casing of mixed strings.
function toSentenceCase(s: string): string {
  // Lowercase everything, then re-capitalise the first letter of the phrase
  // and any letter following a sentence terminator.
  const lower = s.toLowerCase();
  return lower.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, prefix, ch) => prefix + ch.toUpperCase());
}

// Strip editorial parentheticals like "(shown as silver so they are visible)"
// and trailing periods from short spec phrases.
function stripEditorialAside(s: string): string {
  return s
    .replace(/\s*\([^)]*shown[^)]*\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

export function tidySpecValue(value: string | null): string | null {
  if (value == null) return null;
  const stripped = stripEditorialAside(value);
  if (!stripped) return null;
  return isShouty(stripped) ? toSentenceCase(stripped) : stripped;
}
