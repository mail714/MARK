#!/usr/bin/env node
// Convert a Charity Commission "register of charities" extract into a small
// CSV of churches, ready for MARK's Chimera CSV import.
//
//   Input:  the full register extract you downloaded — either the
//           tab-delimited .txt (publicextract.charity.txt) or the .json.
//   Output: churches.csv with the columns MARK expects
//           (name, address, postcode, phone, email, website).
//
// Usage:
//   node scripts/charities-to-csv.mjs publicextract.charity.txt
//   node scripts/charities-to-csv.mjs publicextract.charity.json churches.csv
//
// If the JSON file is very large, give Node more memory:
//   node --max-old-space-size=4096 scripts/charities-to-csv.mjs charity.json
//
// It keeps only currently-registered charities whose name looks like a
// church / place of Christian worship. Edit CHURCH_KEYWORDS below to widen
// or narrow (e.g. add 'mosque', 'synagogue', 'temple' for all faiths).

import fs from 'node:fs';
import readline from 'node:readline';

const CHURCH_KEYWORDS = [
  'church', 'chapel', 'parish', 'parochial church council', 'pcc',
  'cathedral', 'minster', 'abbey', 'priory', 'benefice',
  'methodist', 'baptist', 'presbyterian', 'congregational',
  'united reformed', 'evangelical', 'pentecostal', 'gospel',
  'salvation army', 'quaker', 'friends meeting', 'christian fellowship',
  'vineyard', 'elim', 'assemblies of god', 'catholic', 'diocese',
  'christadelphian', 'brethren', 'tabernacle', 'worship centre',
];
const CHURCH_RE = new RegExp(
  `\\b(${CHURCH_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
);

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'churches.csv';
if (!inputPath) {
  console.error('Usage: node scripts/charities-to-csv.mjs <extract.txt|json> [churches.csv]');
  process.exit(1);
}

// --- helpers ---------------------------------------------------------------

// Find a value in a record by trying known Charity Commission field names
// first, then a fuzzy contains-match — so it survives minor schema changes.
function pick(rec, exact, fuzzy) {
  for (const k of exact) if (rec[k] != null && rec[k] !== '') return String(rec[k]);
  if (fuzzy) {
    for (const key of Object.keys(rec)) {
      if (fuzzy.test(key) && rec[key] != null && rec[key] !== '') return String(rec[key]);
    }
  }
  return '';
}

function toRow(rec) {
  const status = pick(rec, ['charity_registration_status'], /registration.?status/i);
  // Skip removed / non-registered charities.
  if (status && !/^registered$/i.test(status.trim())) return null;
  // NOTE: do NOT filter by linked_charity_number. Individual churches are
  // frequently registered as *linked* charities (linked number 1, 2, 3…)
  // under a parent registration — e.g. "HITCHAM FREE CHURCH" is linked
  // number 2. Dropping non-zero linked numbers would bin most churches.

  const name = pick(rec, ['charity_name'], /charity.?name|^name$/i);
  if (!name || !CHURCH_RE.test(name)) return null;

  const address = [
    pick(rec, ['charity_contact_address1']),
    pick(rec, ['charity_contact_address2']),
    pick(rec, ['charity_contact_address3']),
    pick(rec, ['charity_contact_address4']),
    pick(rec, ['charity_contact_address5']),
  ]
    .filter(Boolean)
    .join(', ');

  return {
    name: name.trim(),
    address: address || pick(rec, [], /address/i),
    postcode: pick(rec, ['charity_contact_postcode'], /post.?code/i),
    phone: pick(rec, ['charity_contact_phone'], /phone|telephone/i),
    email: pick(rec, ['charity_contact_email'], /email/i),
    website: pick(rec, ['charity_contact_web'], /web|url|site/i),
    // Unique entity id for de-duplication — safe even when postcode is
    // blank (many linked-church rows are), unlike a name+postcode key
    // which would collapse every blank-postcode "St Mary's Church" into one.
    _key: `${pick(rec, ['registered_charity_number'], /registered.?charity.?number/i)}-${pick(rec, ['linked_charity_number'], /linked.?charity.?number/i)}`,
  };
}

function csvCell(v) {
  const s = (v ?? '').replace(/\r?\n/g, ' ').trim();
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Dedupe by charity name + postcode so a re-registration doesn't double up.
const seen = new Set();
const out = fs.createWriteStream(outputPath);
out.write('name,address,postcode,phone,email,website\n');
let kept = 0;
let scanned = 0;

function emit(rec) {
  scanned++;
  const row = toRow(rec);
  if (!row) return;
  if (seen.has(row._key)) return;
  seen.add(row._key);
  kept++;
  out.write(
    [row.name, row.address, row.postcode, row.phone, row.email, row.website]
      .map(csvCell)
      .join(',') + '\n',
  );
}

// --- read: JSON array, or tab-delimited streamed line-by-line -------------

async function run() {
  const head = fs.readFileSync(inputPath, { encoding: 'utf8', flag: 'r' }).slice(0, 64).trimStart();
  const isJson = inputPath.toLowerCase().endsWith('.json') || head.startsWith('[') || head.startsWith('{');

  if (isJson) {
    // JSON is cleanest but must be parsed whole — bump heap if it's large.
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const arr = Array.isArray(data) ? data : Object.values(data).find(Array.isArray) ?? [];
    for (const rec of arr) emit(rec);
  } else {
    // Tab-delimited: stream so file size never matters.
    const rl = readline.createInterface({
      input: fs.createReadStream(inputPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    let header = null;
    for await (const line of rl) {
      if (!line) continue;
      const cells = line.split('\t');
      if (!header) {
        header = cells.map((h) => h.trim().replace(/^"|"$/g, ''));
        continue;
      }
      const rec = {};
      for (let i = 0; i < header.length; i++) {
        rec[header[i]] = (cells[i] ?? '').replace(/^"|"$/g, '');
      }
      emit(rec);
    }
  }

  await new Promise((res) => out.end(res));
  console.error(`Scanned ${scanned.toLocaleString()} charities → kept ${kept.toLocaleString()} churches → ${outputPath}`);
}

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
