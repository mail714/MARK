import { normaliseWhitespace, pdfBytesToText } from './text';

export type ProofBoard = {
  ref: string | null;        // "1", "21", etc.
  name: string | null;       // "ENDEAVOUR & GOOD CHARACTER"
  style: string | null;      // "GABLE TOP ACRYLIC HONOURS BOARDS"
  quantity: string | null;   // "1 No."
  size: string | null;       // "740 x 1200mm"
  material: string | null;   // "8mm Clear Acrylic"
  background: string | null; // "Solid black vinyl to the rear"
  graphics: string | null;   // "Gold Avery 736 vinyl lettering..."
  fixings: string | null;    // "19mm stand-off black fixings"
  notes: string | null;      // anything after the structured block, before the next BOARD REF
};

export type ProofSummary = {
  boards: ProofBoard[];
  // Canonical aggregated spec — what most of the boards share.
  canonical: {
    boardType: 'Wooden' | 'Acrylic' | 'Lettering' | null;
    style: string | null;
    size: string | null;
    material: string | null;
    background: string | null;
    graphics: string | null;
    fixings: string | null;
  };
  quoteNumber: string | null;
  salesOrderRef: string | null;   // sometimes "XXXXX" if not filled in
  drawnBy: string | null;
  proofDate: string | null;
  revision: string | null;
  rawText: string;
};

const FIELD_KEYS = ['Quantity', 'Size', 'Material', 'Background', 'Graphics', 'Fixings'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

function inferBoardType(material: string | null, style: string | null): ProofSummary['canonical']['boardType'] {
  const blob = `${material ?? ''} ${style ?? ''}`.toLowerCase();
  if (/acrylic/.test(blob)) return 'Acrylic';
  if (/oak|wood|mdf|veneer/.test(blob)) return 'Wooden';
  if (/lettering/.test(blob) && !/board/.test(blob)) return 'Lettering';
  return null;
}

function mostCommon<T>(values: (T | null)[]): T | null {
  const counts = new Map<string, { value: T; n: number }>();
  for (const v of values) {
    if (v == null) continue;
    const key = typeof v === 'string' ? v : JSON.stringify(v);
    const existing = counts.get(key);
    if (existing) existing.n++;
    else counts.set(key, { value: v, n: 1 });
  }
  let best: { value: T; n: number } | null = null;
  for (const e of counts.values()) {
    if (!best || e.n > best.n) best = e;
  }
  return best?.value ?? null;
}

function parseBoardBlock(
  block: string,
  ref: string,
  name: string | null,
  style: string | null,
): ProofBoard {
  // Block starts at "Quantity:" — only the labelled fields below are parsed here.
  const fields: Record<FieldKey, string | null> = {
    Quantity: null,
    Size: null,
    Material: null,
    Background: null,
    Graphics: null,
    Fixings: null,
  };

  for (let i = 0; i < FIELD_KEYS.length; i++) {
    const key = FIELD_KEYS[i];
    const nextKey = FIELD_KEYS[i + 1];
    const re = new RegExp(
      `${key}\\s*:\\s*(.+?)(?=${nextKey ? `\\s+${nextKey}\\s*:` : '$'})`,
      's',
    );
    const m = block.match(re);
    if (m) fields[key] = normaliseWhitespace(m[1]);
  }

  // Size sometimes has " - 10% SCALE" suffix. Trim it for a clean canonical value.
  if (fields.Size) {
    fields.Size = fields.Size.replace(/\s*-\s*\d+%\s*SCALE.*$/i, '').trim();
  }

  return {
    ref,
    name,
    style,
    quantity: fields.Quantity,
    size: fields.Size,
    material: fields.Material,
    background: fields.Background,
    graphics: fields.Graphics,
    fixings: fields.Fixings,
    notes: null,
  };
}

// Top shape + material combinations seen in proofs. Match on the style as a
// whole so we don't bleed into the board name (which can include words like
// "GOOD" that would otherwise trip a generic [A-Z]+ pattern).
const STYLE_RE =
  /(?:(?:GABLE|FLAT|ARCH|CIRCULAR|HEXAGONAL)(?:\s+TOP)?\s+)?(?:ACRYLIC|WOODEN|OAK|MDF|ALUMINIUM|ALUMINUM|COMPOSITE|DIBOND)\s+HONOURS\s+BOARDS?/i;

export async function parseProofPdf(bytes: Uint8Array): Promise<ProofSummary> {
  const text = await pdfBytesToText(bytes);

  // Find every "BOARD REF NN" marker; the name and style follow until the
  // next field key (Quantity:) or the next BOARD REF.
  const headerRe = /BOARD REF\s*(\d+)\s*[-–]?\s*/g;
  const positions: { ref: string; index: number; headerEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(text)) !== null) {
    positions.push({ ref: m[1], index: m.index, headerEnd: m.index + m[0].length });
  }

  const boards: ProofBoard[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end = i + 1 < positions.length ? positions[i + 1].index : text.length;
    const chunk = text.slice(start, end);

    // Within the chunk, the section before "Quantity:" holds the name + style.
    const qIdx = chunk.search(/\bQuantity\s*:/);
    const headerSlice = qIdx >= 0 ? chunk.slice(0, qIdx) : chunk;
    const afterRefPrefix = headerSlice.slice(positions[i].headerEnd - start);
    const nameAndStyle = normaliseWhitespace(afterRefPrefix);

    // Split name from style at the start of the known style pattern.
    const styleMatch = nameAndStyle.match(STYLE_RE);
    let name: string | null = null;
    let style: string | null = null;
    if (styleMatch && styleMatch.index !== undefined) {
      name = nameAndStyle.slice(0, styleMatch.index).trim() || null;
      style = nameAndStyle.slice(styleMatch.index).trim() || null;
    } else {
      name = nameAndStyle || null;
    }

    boards.push(
      parseBoardBlock(qIdx >= 0 ? chunk.slice(qIdx) : chunk, positions[i].ref, name, style),
    );
  }

  const canonical = {
    style: mostCommon(boards.map((b) => b.style)),
    size: mostCommon(boards.map((b) => b.size)),
    material: mostCommon(boards.map((b) => b.material)),
    background: mostCommon(boards.map((b) => b.background)),
    graphics: mostCommon(boards.map((b) => b.graphics)),
    fixings: mostCommon(boards.map((b) => b.fixings)),
    boardType: null as ProofSummary['canonical']['boardType'],
  };
  canonical.boardType = inferBoardType(canonical.material, canonical.style);

  // Footer block looks like: "58203 XXXXX JL/MR 20/11/2024 K1 Quote: Sales
  // Order: Drawn By: Date: Revision:". Values precede their labels (table
  // columns linearised). Anchor on the label run, capture the values run
  // immediately before.
  const footerRe =
    /(\S+)\s+(\S+)\s+(\S+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s+Quote:\s*Sales Order:\s*Drawn By:\s*Date:\s*Revision:/;
  const footer = text.match(footerRe);

  return {
    boards,
    canonical,
    quoteNumber: footer?.[1] ?? null,
    salesOrderRef: footer?.[2] ?? null,
    drawnBy: footer?.[3] ?? null,
    proofDate: footer?.[4] ?? null,
    revision: footer?.[5] ?? null,
    rawText: text,
  };
}
