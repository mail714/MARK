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
  } catch {
    // If the endpoint is unreachable, we still return the standard field
    // set — the push will only send well-known fields and skip any
    // account-specific extras.
  }
  return names;
}
