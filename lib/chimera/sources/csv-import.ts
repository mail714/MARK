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

const HEADER_ALIASES: Record<string, keyof CsvImportRow> = {
  'business name': 'business_name',
  'business': 'business_name',
  'name': 'business_name',
  'company': 'business_name',
  'address': 'address',
  'postcode': 'postcode',
  'post code': 'postcode',
  'zip': 'postcode',
  'phone': 'phone',
  'telephone': 'phone',
  'tel': 'phone',
  'website': 'website',
  'url': 'website',
  'site': 'website',
  'email': 'email',
  'emails': 'emails',
  'email(s)': 'emails',
};

export function parseCsv(text: string): CsvImportRow[] {
  // Simple CSV parser that handles quoted fields with embedded commas.
  const lines = splitLines(text);
  if (lines.length < 2) return [];
  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const mapped = header.map((h) => HEADER_ALIASES[h] ?? null);

  const rows: CsvImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = splitRow(lines[i]);
    const row: Partial<CsvImportRow> = {};
    for (let j = 0; j < fields.length; j++) {
      const key = mapped[j];
      if (key) row[key] = fields[j].trim();
    }
    if (row.business_name) rows.push(row as CsvImportRow);
  }
  return rows;
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

function splitRow(line: string): string[] {
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
      phone: r.phone?.trim() ?? null,
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
