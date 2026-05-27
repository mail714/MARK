import { normaliseWhitespace, pdfBytesToText } from './text';

export type SalesOrderItem = {
  index: number;
  name: string;
  qty: number | null;
  unit: string | null;
  unitPrice: string | null;
  total: string | null;
  description: string;
  width: string | null;
  height: string | null;
  fixingsQty: number | null;
};

export type SalesOrder = {
  soNumber: string | null;
  quoteNumber: string | null;
  poNumber: string | null;
  orderDate: string | null;
  customerName: string | null;
  customerBrief: string | null;
  customerAddress: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  items: SalesOrderItem[];
  subtotal: string | null;
  vat: string | null;
  total: string | null;
  rawText: string;
};

function match(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function pickEmail(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
  return m ? m[0] : null;
}

function pickPhone(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/\b0\d[\d\s-]{8,}/);
  return m ? m[0].trim() : null;
}

function parseTitle(text: string): {
  customerName: string | null;
  customerBrief: string | null;
} {
  // Title appears right after "Sales Order # NNNN" and before "SALES REP INFO".
  // e.g. "The Bishop's Stortford High School - Acrylic Honours Boards"
  const re = /Sales Order #\s*\d+\s+(.+?)\s+SALES REP INFO/s;
  const m = text.match(re);
  if (!m) return { customerName: null, customerBrief: null };
  const title = normaliseWhitespace(m[1]);
  const dashIdx = title.indexOf(' - ');
  if (dashIdx === -1) {
    return { customerName: title || null, customerBrief: null };
  }
  return {
    customerName: title.slice(0, dashIdx).trim() || null,
    customerBrief: title.slice(dashIdx + 3).trim() || null,
  };
}

function parseOrderedByBlock(text: string): {
  address: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
} {
  // "ORDERED BY ... CONTACT INFO Name email phone #"
  const re = /ORDERED BY\s+(.+?)\s+CONTACT INFO\s+(.+?)\s+#\s+ITEM/s;
  const m = text.match(re);
  if (!m) {
    return {
      address: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
    };
  }
  const address = normaliseWhitespace(m[1]);
  const contactBlock = normaliseWhitespace(m[2]);
  const contactEmail = pickEmail(contactBlock);
  const contactPhone = pickPhone(contactBlock);

  // Contact name is whatever's before the email
  let contactName: string | null = null;
  if (contactEmail) {
    contactName = contactBlock.slice(0, contactBlock.indexOf(contactEmail)).trim() || null;
  } else {
    contactName = contactBlock.split(/\s+\d/)[0].trim() || null;
  }

  return { address, contactName, contactEmail, contactPhone };
}

function parseItems(text: string): SalesOrderItem[] {
  // Items block sits between "# ITEM QTY UOM U.PRICE TOTAL (EXCL. VAT) TAX TAXABLE"
  // and the closing dashes line.
  const startRe = /#\s+ITEM\s+QTY\s+UOM\s+U\.PRICE\s+TOTAL[^]+?TAXABLE\s+/;
  const startMatch = text.match(startRe);
  if (!startMatch) return [];
  const startIdx = startMatch.index! + startMatch[0].length;
  const tail = text.slice(startIdx);

  // The items block ends at the long dashed line.
  const endMatch = tail.match(/-{10,}/);
  const block = endMatch ? tail.slice(0, endMatch.index) : tail;

  // Each item line starts with a small integer (the line number) followed by a space.
  // Use a lookahead split: "1 ... 2 ... 3 ..." in order.
  // Identify line-number positions: digits 1-2 chars at start or preceded by whitespace,
  // followed by space and a capital letter (the item name).
  const itemStarts: number[] = [];
  const re = /(?:^|\s)(\d{1,2})\s+(?=[A-Z])/g;
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const lineNum = parseInt(m[1], 10);
    // Items are numbered sequentially from 1. Reject jumps.
    if (last === -1 && lineNum !== 1) continue;
    if (last !== -1 && lineNum !== last + 1) continue;
    itemStarts.push(m.index + (m[0].startsWith(' ') ? 1 : 0));
    last = lineNum;
  }

  const items: SalesOrderItem[] = [];
  for (let i = 0; i < itemStarts.length; i++) {
    const from = itemStarts[i];
    const to = i + 1 < itemStarts.length ? itemStarts[i + 1] : block.length;
    const segment = block.slice(from, to).trim();

    // segment looks like:
    // 1 Acrylic Honours Board (Clear Acrylic + Black Back) 20 Each £357.00 £7,140.00 £1,428.00 Y <description...>
    const lineRe =
      /^(\d{1,2})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(Each|Hour|Day|Item|Set)\s+(£[\d,.]+)\s+(£[\d,.]+)\s+(£[\d,.]+)\s+([YN])\s*(.*)$/s;
    const lm = segment.match(lineRe);
    if (!lm) {
      // Try a more relaxed pattern (delivery lines have no spec details).
      const relax = segment.match(
        /^(\d{1,2})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(Each|Hour|Day|Item|Set)\s+(£[\d,.]+)\s+(£[\d,.]+)/,
      );
      if (relax) {
        items.push({
          index: parseInt(relax[1], 10),
          name: relax[2].trim(),
          qty: Number(relax[3].replace(',', '')) || null,
          unit: relax[4],
          unitPrice: relax[5],
          total: relax[6],
          description: '',
          width: null,
          height: null,
          fixingsQty: null,
        });
      }
      continue;
    }
    const [, idx, name, qty, unit, unitPrice, total, , , desc] = lm;
    const descNorm = normaliseWhitespace(desc);
    items.push({
      index: parseInt(idx, 10),
      name: name.trim(),
      qty: Number(qty.replace(',', '')) || null,
      unit,
      unitPrice,
      total,
      description: descNorm,
      width: match(descNorm, /Width:\s*([\d.,]+\s*mm)/i),
      height: match(descNorm, /Height:\s*([\d.,]+\s*mm)/i),
      fixingsQty: (() => {
        const f = match(descNorm, /Qty of (?:Barrel )?Fixings:\s*(\d+)/i);
        return f ? Number(f) : null;
      })(),
    });
  }

  return items;
}

export async function parseSalesOrderPdf(bytes: Uint8Array): Promise<SalesOrder> {
  const text = await pdfBytesToText(bytes);
  const { customerName, customerBrief } = parseTitle(text);
  const orderedBy = parseOrderedByBlock(text);
  const items = parseItems(text);

  return {
    soNumber: match(text, /Sales Order #\s*(\d+)/),
    quoteNumber: match(text, /\bQT#\s*(\d+)/),
    poNumber: match(text, /\bPO#\s*([A-Z0-9-]+)/),
    orderDate: match(text, /SALES ORDER DATE\s+([^\n]+?)\s+TERMS/),
    customerName,
    customerBrief,
    customerAddress: orderedBy.address,
    contactName: orderedBy.contactName,
    contactEmail: orderedBy.contactEmail,
    contactPhone: orderedBy.contactPhone,
    items,
    subtotal: match(text, /Subtotal:\s*Total VAT:\s*Final price:\s*(£[\d,.]+)/),
    vat: match(text, /Subtotal:\s*Total VAT:\s*Final price:\s*£[\d,.]+\s*(£[\d,.]+)/),
    total: match(text, /Subtotal:\s*Total VAT:\s*Final price:\s*£[\d,.]+\s*£[\d,.]+\s*(£[\d,.]+)/),
    rawText: text,
  };
}
