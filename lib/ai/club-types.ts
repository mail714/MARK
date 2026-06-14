// Controlled vocabulary for the Wix CMS clubType field on the Honours
// Boards brand. Anything not on this list will not be accepted on the
// site, so MARK enforces it both when the LLM picks tags and when the
// operator edits the field.

export const HONOURS_BOARDS_CLUB_TYPES = [
  'Bowls',
  'Corporate',
  'Cricket',
  'Football',
  'Golf',
  'Government',
  'Masons',
  'Religious',
  'Rugby',
  'Schools',
  'Sports Clubs',
  'Swimming',
  'Tennis',
] as const;

export type HonoursBoardsClubType = (typeof HONOURS_BOARDS_CLUB_TYPES)[number];

export function isValidClubType(value: string): value is HonoursBoardsClubType {
  return (HONOURS_BOARDS_CLUB_TYPES as readonly string[]).includes(value);
}

export function filterToValidClubTypes(values: readonly string[] | null | undefined): HonoursBoardsClubType[] {
  if (!values) return [];
  const seen = new Set<HonoursBoardsClubType>();
  for (const v of values) if (isValidClubType(v)) seen.add(v);
  return Array.from(seen);
}
