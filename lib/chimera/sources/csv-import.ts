import { createHash } from 'node:crypto';
import { domainOf, extractPostcode } from '../website-scrape';
import { upsertProspect } from '../prospects';
import { updateSearch } from '../searches';

export type CsvImportRow = {
  business_name: string;
  address?: string;
  postcode?: string;
  phone?: string;
  website?: string;
  email?: string;          // single column
  emails?: string;         // ; or , separated multi
};

// Single-value header aliases. Header names are normalised (lowercased,
// underscores → spaces, whitespace collapsed) before lookup, so
// 'business_name', 'Business Name' and 'BUSINESS  NAME' all resolve here.
const HEADER_ALIASES: Record<string, keyof CsvImportRow> = {
  'business name': 'business_name',
  'business': 'business_name',
  'name': 'business_name',
  'company': 'business_name',
  'company name': 'business_name',
  'organisation': 'business_name',
  'organization': 'business_name',
  'practice': 'business_name',
  'practice name': 'business_name',
  'postcode': 'postcode',
  'post code': 'postcode',
  'zip': 'postcode',
  'phone': 'phone',
  'telephone': 'phone',
  'tel': 'phone',
  'website': 'website',
  'url': 'website',
  'site': 'website',
  'web': 'website',
  'email': 'email',
  'e-mail': 'email',
  'emails': 'emails',
  'email(s)': 'emails',
};

// Columns that together make up the postal address. Every matching column,
// in order, is joined into one address string — so Address1 / Address2 /
// Town collapse into "13 Clare Street, Bristol".
const ADDRESS_HEADER = /^(address|addr|street|town|city|county|locality)\s*\d*$/;

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

// Pick the delimiter by seeing which candidate appears most in the header
// row — so tab-separated exports (very common from spreadsheets and
// government portals) import just as well as comma CSVs.
function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = {
    '\t': (headerLine.match(/\t/g) ?? []).length,
    ',': (headerLine.match(/,/g) ?? []).length,
    ';': (headerLine.match(/;/g) ?? []).length,
  };
  let best = ',';
  let n = 0;
  for (const [d, c] of Object.entries(counts)) if (c > n) { best = d; n = c; }
  return best;
}

export function parseCsv(text: string): CsvImportRow[] {
  const lines = splitLines(text).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const header = splitRow(lines[0], delimiter).map(normaliseHeader);

  const rows: CsvImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitRow(lines[i], delimiter);
    const row: Partial<CsvImportRow> = {};
    const addressParts: string[] = [];
    for (let j = 0; j < header.length; j++) {
      const h = header[j];
      const val = (fields[j] ?? '').trim();
      if (!val) continue;
      const key = HEADER_ALIASES[h];
      if (key) {
        row[key] = val;
      } else if (ADDRESS_HEADER.test(h)) {
        addressParts.push(val);
      }
    }
    if (!row.address && addressParts.length) row.address = addressParts.join(', ');
    if (row.business_name) rows.push(row as CsvImportRow);
  }
  return rows;
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function splitRow(line: string, delimiter: string): string[] {
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
    } else if (c === delimiter) {
      out.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  out.push(buf);
  return out;
}

function csvSourceId(row: CsvImportRow): string {
  const seed = [
    (row.email ?? row.emails ?? '').toLowerCase(),
    (row.website ?? '').toLowerCase(),
    row.business_name.toLowerCase(),
    (row.postcode ?? '').toLowerCase(),
  ].join('|');
  return createHash('sha1').update(seed).digest('hex').slice(0, 32);
}

export async function importCsvProspects(searchId: string, rows: CsvImportRow[]): Promise<{
  inserted: number;
  withEmail: number;
  withWebsite: number;
}> {
  await updateSearch(searchId, {
    status: 'running',
    started_at: new Date().toISOString(),
    grid_cells_total: rows.length,
  });

  let inserted = 0;
  let withEmail = 0;
  let withWebsite = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const emails = parseEmailField(r);
    const domain = domainOf(r.website ?? null);
    const postcode = r.postcode
      ? extractPostcode(r.postcode) ?? r.postcode.trim().toUpperCase()
      : r.address
        ? extractPostcode(r.address)
        : null;

    await upsertProspect({
      source: 'csv-import',
      source_id: csvSourceId(r),
      business_name: r.business_name.trim(),
      address: r.address?.trim() ?? null,
      google_address: null,
      address_note: null,
      postcode,
      phone: normaliseUkPhone(r.phone),
      website: r.website?.trim() ?? null,
      website_domain: domain,
      emails,
      rating: null,
      reviews: null,
      types: [],
      raw: r as unknown as Record<string, unknown>,
      is_chain: false,
      chain_reason: null,
      search_id: searchId,
    });

    inserted += 1;
    if (emails.length > 0) withEmail += 1;
    if (r.website) withWebsite += 1;

    if (i % 25 === 0) {
      await updateSearch(searchId, {
        prospects_found: inserted,
        prospects_with_email: withEmail,
        prospects_with_website: withWebsite,
        grid_cells_processed: i + 1,
      });
    }
  }

  await updateSearch(searchId, {
    status: 'completed',
    finished_at: new Date().toISOString(),
    grid_cells_processed: rows.length,
    prospects_found: inserted,
    prospects_with_email: withEmail,
    prospects_with_website: withWebsite,
  });

  return { inserted, withEmail, withWebsite };
}

function parseEmailField(r: CsvImportRow): string[] {
  const raw = r.emails ?? r.email ?? '';
  return raw
    .split(/[;,]/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /.+@.+\..+/.test(e));
}

// Restores the leading 0 on UK phone numbers that lost it in export
// (e.g. '1179275890' -> '01179275890', '7788966237' -> '07788966237').
// Only touches numbers that plainly need it: 10 national digits, not
// already starting with 0, and not international (+44 / 00). Anything
// else is passed through unchanged so we never mangle a good number.
function normaliseUkPhone(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (s.startsWith('+') || s.replace(/\D/g, '').startsWith('00')) return s; // international
  const digits = s.replace(/\D/g, '');
  if (digits.startsWith('0')) return s; // already has the leading zero
  if (digits.length === 10 && /^[1-9]/.test(digits)) return `0${s}`;
  return s;
}
