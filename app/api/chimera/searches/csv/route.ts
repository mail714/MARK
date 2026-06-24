import { NextResponse } from 'next/server';
import { createSearch } from '@/lib/chimera/searches';
import { importCsvProspects, parseCsv } from '@/lib/chimera/sources/csv-import';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const csv = typeof body.csv === 'string' ? body.csv : '';
  if (!csv.trim()) {
    return NextResponse.json({ error: 'csv body is required' }, { status: 400 });
  }
  const notes = typeof body.notes === 'string' ? body.notes : null;
  const label = typeof body.label === 'string' ? body.label : 'CSV import';

  let rows;
  try {
    rows = parseCsv(csv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `CSV parse failed: ${message}` }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No rows parsed from CSV (need a "business_name" column at minimum)' }, { status: 400 });
  }

  try {
    const id = await createSearch({
      source: 'csv-import',
      category_label: label,
      max_results: rows.length,
      apply_chain_filter: false,
      notes,
    });
    // CSV is bounded by file size so we await it inline up to maxDuration.
    const summary = await importCsvProspects(id, rows);
    return NextResponse.json({ ok: true, id, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
