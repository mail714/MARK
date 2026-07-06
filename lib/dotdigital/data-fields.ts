import { dotdigital } from './client';

type DataField = {
  name: string;
  type: string;
  visibility?: string;
  defaultValue?: string;
};

// Fetches the custom data fields configured on the dotdigital account.
// The standard fields (FIRSTNAME, LASTNAME, FULLNAME, GENDER, POSTCODE)
// are always available regardless of what /data-fields returns — we
// include them explicitly so the caller can safely reference them.
const STANDARD_FIELDS = ['FIRSTNAME', 'LASTNAME', 'FULLNAME', 'GENDER', 'POSTCODE'];

export async function listAllDataFieldNames(): Promise<Set<string>> {
  const names = new Set(STANDARD_FIELDS);
  try {
    const list = await dotdigital.get<DataField[]>('/v2/data-fields');
    if (Array.isArray(list)) {
      for (const f of list) {
        if (f.name) names.add(f.name.toUpperCase());
      }
    }
  } catch (err) {
    // Auth failures mean the whole push is about to fail anyway — surface
    // them instead of silently degrading every contact to FIRSTNAME-only.
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) throw err;
    // Anything else (5xx, network): fall back to the standard field set —
    // the push still works, just without account-specific extras — but
    // leave a trace so the omission is diagnosable.
    console.warn(
      'dotdigital /v2/data-fields unavailable — pushing with standard fields only:',
      err instanceof Error ? err.message : err,
    );
  }
  return names;
}
