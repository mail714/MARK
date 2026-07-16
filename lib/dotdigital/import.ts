import { dotdigitalUrlFor, dotdigitalBasicAuth } from './client';
import { listAllDataFieldNames } from './data-fields';

// dotdigital bulk contact import. Instead of one API call per contact
// (which trips the per-second/per-hour rate limit on any real list), we
// upload a whole CSV in a single call and poll for completion. dotdigital
// handles de-duplication, suppression and data-field mapping server-side.
//
//   POST /v2/address-books/{id}/contacts/import   (multipart CSV)  -> { id, status }
//   GET  /v2/contacts/import/{importId}                            -> { id, status }
//
// The CSV's first column must be headed "Email"; other column headers map
// to the account's contact data fields by name.

export type ImportStatus =
  | 'NotFinished'
  | 'Finished'
  | 'RejectedByWatchdog'
  | 'InvalidFileFormat'
  | 'ExceedsAllowedContactLimit'
  | 'Unknown'
  | 'Failed';

export type ContactImport = { id: string; status: ImportStatus };

const TERMINAL: ReadonlySet<ImportStatus> = new Set([
  'Finished',
  'RejectedByWatchdog',
  'InvalidFileFormat',
  'ExceedsAllowedContactLimit',
  'Failed',
]);

export function isTerminalImportStatus(s: ImportStatus): boolean {
  return TERMINAL.has(s);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Small fetch wrapper that mirrors the JSON client's 429/503 backoff, but
// leaves the caller in control of headers/body (needed for multipart).
async function ddFetch(path: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(dotdigitalUrlFor(path), { ...init, cache: 'no-store' });
    if ((res.status === 429 || res.status === 503) && attempt < 6) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(60_000, 1000 * 2 ** attempt);
      await res.body?.cancel().catch(() => {});
      await sleep(waitMs);
      continue;
    }
    return res;
  }
}

function csvCell(v: string | null | undefined): string {
  const s = (v ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type ImportContactRow = {
  email: string;
  firstName?: string | null;
  telephone?: string | null;
  website?: string | null;
};

// Builds the import CSV, including only data-field columns that actually
// exist on the account (an unknown column header would fail the import).
export async function buildImportCsv(rows: ImportContactRow[]): Promise<string> {
  const fields = await listAllDataFieldNames();
  const cols: Array<{ header: string; get: (r: ImportContactRow) => string | null | undefined }> = [
    { header: 'Email', get: (r) => r.email },
  ];
  if (fields.has('FIRSTNAME')) cols.push({ header: 'FIRSTNAME', get: (r) => r.firstName });
  if (fields.has('TELEPHONE')) cols.push({ header: 'TELEPHONE', get: (r) => r.telephone });
  if (fields.has('WEBSITE')) cols.push({ header: 'WEBSITE', get: (r) => r.website });

  const lines = [cols.map((c) => c.header).join(',')];
  for (const r of rows) {
    lines.push(cols.map((c) => csvCell(c.get(r))).join(','));
  }
  return lines.join('\n');
}

export async function startContactImport(
  addressBookId: number,
  csv: string,
): Promise<ContactImport> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([csv], { type: 'text/csv' }),
    'contacts.csv',
  );
  const res = await ddFetch(`/v2/address-books/${addressBookId}/contacts/import`, {
    method: 'POST',
    headers: {
      Authorization: dotdigitalBasicAuth(),
      Accept: 'application/json',
      // NB: no Content-Type — fetch sets multipart/form-data + boundary.
    },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`dotdigital import failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text) as ContactImport;
  return data;
}

export async function getImportStatus(importId: string): Promise<ContactImport> {
  const res = await ddFetch(`/v2/contacts/import/${importId}`, {
    method: 'GET',
    headers: {
      Authorization: dotdigitalBasicAuth(),
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`dotdigital import status failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as ContactImport;
}

// Submits one batch and polls until it reaches a terminal status (or times
// out). Returns the final status.
export async function runImportBatch(
  addressBookId: number,
  rows: ImportContactRow[],
  opts: { pollMs?: number; timeoutMs?: number } = {},
): Promise<ImportStatus> {
  const csv = await buildImportCsv(rows);
  const started = await startContactImport(addressBookId, csv);
  const pollMs = opts.pollMs ?? 4000;
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  let waited = 0;
  let status = started.status;
  while (!isTerminalImportStatus(status)) {
    if (waited >= timeoutMs) return 'Unknown';
    await sleep(pollMs);
    waited += pollMs;
    status = (await getImportStatus(started.id)).status;
  }
  return status;
}
