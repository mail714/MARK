// Downloads + parses the gov.uk Get Information About Schools (GIAS) bulk
// CSV. The whole file is ~10MB / ~25k rows so we stream-parse to keep
// memory bounded — Render's 512MB instance OOMs if you materialise the
// full row array up front.

const URL_TEMPLATE = (yyyymmdd: string) =>
  `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${yyyymmdd}.csv`;

const DOWNLOADS_PAGE = 'https://get-information-schools.service.gov.uk/Downloads';

// Exported so the sync UI can show the operator exactly what's being tried
// and the URL pattern, in case gov.uk ever changes the dated-file format
// and we need to override.
export const GIAS_URL_PATTERN =
  'https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata{YYYYMMDD}.csv';
export const GIAS_DOWNLOADS_PAGE = DOWNLOADS_PAGE;

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// Resolves the GIAS CSV by URL — returns a Response whose body we'll stream.
// Tries today's dated URL first, walks back a week, then scrapes the
// downloads page as a last resort. Throws with a friendly message if none
// work.
export async function resolveGiasResponse(opts: { sourceUrlOverride?: string } = {}): Promise<{
  response: Response;
  sourceUrl: string;
}> {
  if (opts.sourceUrlOverride) {
    const res = await fetch(opts.sourceUrlOverride, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Override URL returned HTTP ${res.status}`);
    return { response: res, sourceUrl: opts.sourceUrlOverride };
  }

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
      if (res.ok) return { response: res, sourceUrl: url };
    } catch {
      // try the next one
    }
  }

  // Last resort: scrape the downloads page for the current establishment data
  // link. The page lists files by date; the regex picks up the most recent.
  try {
    const pageRes = await fetch(DOWNLOADS_PAGE, { redirect: 'follow' });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const match = html.match(/https?:\/\/[^"']+edubasealldata\d{8}\.csv/i);
      if (match) {
        const csvRes = await fetch(match[0], { redirect: 'follow' });
        if (csvRes.ok) return { response: csvRes, sourceUrl: match[0] };
      }
    }
  } catch {
    // fall through
  }

  throw new Error(
    'Could not fetch the GIAS schools CSV from gov.uk. Try again later, or paste a custom URL from https://get-information-schools.service.gov.uk/Downloads.',
  );
}

// Splits a CSV row that may contain quoted fields with embedded commas.
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

function parseRow(
  line: string,
  colTargets: (keyof GiasRow | null)[],
): GiasRow | null {
  const fields = splitCsvRow(line);
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
    return row as GiasRow;
  }
  return null;
}

// Streams rows out of an HTTP response body. Holds only the rolling text
// buffer + the current line — never the full CSV or row array. This is the
// hot path that prevents Render OOMs on a 25k-row import.
export async function* streamGiasRowsFromResponse(
  response: Response,
): AsyncIterable<GiasRow> {
  if (!response.body) throw new Error('Response had no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let colTargets: (keyof GiasRow | null)[] | null = null;
  let validated = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      if (done) buffer += decoder.decode();

      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.trim()) continue;

        if (!colTargets) {
          if (!line.includes('URN')) {
            throw new Error(
              "Response doesn't look like a GIAS CSV (header has no 'URN' column).",
            );
          }
          const header = splitCsvRow(line);
          colTargets = header.map((h) => COLUMN_MAP[h] ?? null);
          validated = true;
          continue;
        }

        const row = parseRow(line, colTargets);
        if (row) yield row;
      }

      if (done) {
        // Flush trailing line without newline.
        if (buffer.trim() && colTargets) {
          const row = parseRow(buffer.trim(), colTargets);
          if (row) yield row;
          buffer = '';
        }
        break;
      }
    }
    if (!validated) throw new Error('Empty response from GIAS URL.');
  } finally {
    reader.releaseLock();
  }
}

// Streams rows out of a CSV string (manual paste / upload). Uses indexOf
// rather than split() to avoid materialising a 25k-element line array on
// top of the source string. Synchronous generator since no I/O.
export function* streamGiasRowsFromString(csv: string): Iterable<GiasRow> {
  let colTargets: (keyof GiasRow | null)[] | null = null;
  let pos = 0;
  const len = csv.length;

  while (pos < len) {
    let nl = csv.indexOf('\n', pos);
    if (nl === -1) nl = len;
    let line = csv.slice(pos, nl);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    pos = nl + 1;
    if (!line.trim()) continue;

    if (!colTargets) {
      if (!line.includes('URN')) {
        throw new Error("CSV header has no 'URN' column — wrong format?");
      }
      const header = splitCsvRow(line);
      colTargets = header.map((h) => COLUMN_MAP[h] ?? null);
      continue;
    }

    const row = parseRow(line, colTargets);
    if (row) yield row;
  }
}
