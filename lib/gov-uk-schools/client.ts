// Downloads the 'Get Information About Schools' (GIAS) bulk CSV from gov.uk.
// The file lives at a dated URL that changes daily — we try today's first,
// then walk back a few days in case today's hasn't been generated yet. If
// all fail we fall back to scraping the downloads page for the current
// link.
//
// CSV is large (~25k rows, ~10MB) — we stream and parse line by line so we
// don't blow the request memory.

const URL_TEMPLATE = (yyyymmdd: string) =>
  `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${yyyymmdd}.csv`;

const DOWNLOADS_PAGE = 'https://get-information-schools.service.gov.uk/Downloads';

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export async function fetchGiasCsv(): Promise<{ csv: string; sourceUrl: string }> {
  // Try today's dated URL, then yesterday's, then a week ago. Most days
  // today's is ready by early morning UK time.
  const candidates: string[] = [];
  const now = new Date();
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - offset);
    candidates.push(URL_TEMPLATE(ymd(d)));
  }

  for (const url of candidates) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (res.ok) {
        const csv = await res.text();
        // Quick sanity check — the file should start with a header row that
        // contains "URN".
        if (csv.includes('URN')) return { csv, sourceUrl: url };
      }
    } catch {
      // try the next one
    }
  }

  // Fallback: scrape the downloads page for the current establishment data
  // link. The page lists files by date; we look for the most recent
  // 'edubasealldata' CSV link.
  try {
    const res = await fetch(DOWNLOADS_PAGE, { redirect: 'follow' });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/https?:\/\/[^"']+edubasealldata\d{8}\.csv/i);
      if (match) {
        const csvRes = await fetch(match[0], { redirect: 'follow' });
        if (csvRes.ok) {
          const csv = await csvRes.text();
          if (csv.includes('URN')) return { csv, sourceUrl: match[0] };
        }
      }
    }
  } catch {
    // fall through
  }

  throw new Error(
    'Could not fetch the GIAS schools CSV from gov.uk. The file may not be ready today — try again later, or download manually from https://get-information-schools.service.gov.uk/Downloads and paste via the manual upload.',
  );
}

// Parse a single CSV row that may contain quoted fields with embedded commas.
function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        buf += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  out.push(buf);
  return out;
}

export type GiasRow = {
  urn: string;
  establishment_name: string;
  status: string | null;
  type_of_establishment: string | null;
  phase_of_education: string | null;
  establishment_type_group: string | null;
  statutory_low_age: number | null;
  statutory_high_age: number | null;
  gender: string | null;
  religious_character: string | null;
  school_capacity: number | null;
  number_of_pupils: number | null;
  number_of_boys: number | null;
  number_of_girls: number | null;
  head_title: string | null;
  head_first_name: string | null;
  head_last_name: string | null;
  head_job_title: string | null;
  telephone: string | null;
  website: string | null;
  street: string | null;
  locality: string | null;
  town: string | null;
  county: string | null;
  postcode: string | null;
  la_name: string | null;
  la_district: string | null;
  easting: number | null;
  northing: number | null;
};

// GIAS column names we care about. Mapped to schools_register columns.
// The CSV has 100+ columns; we only pull the ones we use.
const COLUMN_MAP: Record<string, keyof GiasRow> = {
  URN: 'urn',
  EstablishmentName: 'establishment_name',
  'EstablishmentStatus (name)': 'status',
  'TypeOfEstablishment (name)': 'type_of_establishment',
  'PhaseOfEducation (name)': 'phase_of_education',
  'EstablishmentTypeGroup (name)': 'establishment_type_group',
  StatutoryLowAge: 'statutory_low_age',
  StatutoryHighAge: 'statutory_high_age',
  'Gender (name)': 'gender',
  'ReligiousCharacter (name)': 'religious_character',
  SchoolCapacity: 'school_capacity',
  NumberOfPupils: 'number_of_pupils',
  NumberOfBoys: 'number_of_boys',
  NumberOfGirls: 'number_of_girls',
  HeadTitle: 'head_title',
  'HeadTitle (name)': 'head_title',
  HeadFirstName: 'head_first_name',
  HeadLastName: 'head_last_name',
  HeadPreferredJobTitle: 'head_job_title',
  TelephoneNum: 'telephone',
  SchoolWebsite: 'website',
  Street: 'street',
  Locality: 'locality',
  Town: 'town',
  County: 'county',
  Postcode: 'postcode',
  'LA (name)': 'la_name',
  'DistrictAdministrative (name)': 'la_district',
  Easting: 'easting',
  Northing: 'northing',
};

const NUMERIC_FIELDS = new Set<keyof GiasRow>([
  'statutory_low_age',
  'statutory_high_age',
  'school_capacity',
  'number_of_pupils',
  'number_of_boys',
  'number_of_girls',
  'easting',
  'northing',
]);

export function parseGiasCsv(csv: string): GiasRow[] {
  const lines = csv.replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 2) return [];
  const header = splitCsvRow(lines[0]);
  // For each CSV column, work out which schools_register column it maps to
  // (or null to skip).
  const colTargets: (keyof GiasRow | null)[] = header.map((h) => COLUMN_MAP[h] ?? null);

  const rows: GiasRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = splitCsvRow(lines[i]);
    const row: Partial<GiasRow> = {};
    for (let j = 0; j < fields.length; j++) {
      const target = colTargets[j];
      if (!target) continue;
      const raw = fields[j].trim();
      if (raw === '') continue;
      if (NUMERIC_FIELDS.has(target)) {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          (row[target] as number) = Math.floor(n);
        }
      } else {
        (row[target] as string) = raw;
      }
    }
    if (row.urn && row.establishment_name) {
      rows.push(row as GiasRow);
    }
  }
  return rows;
}
