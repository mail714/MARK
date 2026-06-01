import { getDriveClient } from '@/lib/drive/client';
import type { PendingFolder } from '@/lib/drive/folders';
import { extractSpecWithClaude } from '@/lib/ai/spec-extractor';
import { pdfBytesToText } from './text';
import { parseSalesOrderPdf, type SalesOrder } from './sales-order';

export type ExtractedSpec = {
  // From sales order — regex-extracted (mechanical template, very stable)
  soNumber: string | null;
  customerName: string | null;
  customerBrief: string | null;
  customerAddress: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  orderDate: string | null;

  // Canonical board spec — LLM-extracted (robust to proof template variations)
  boardType: 'Wooden' | 'Acrylic' | 'Lettering' | null;
  boardSize: string | null;
  material: string | null;
  background: string | null;
  graphics: string | null;
  fixings: string | null;
  style: string | null;
  boardCount: number;

  // Underlying parsed sales-order kept for debugging / detail views
  salesOrder: SalesOrder | null;
};

async function downloadPdf(fileId: string): Promise<Uint8Array> {
  const drive = getDriveClient();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  return new Uint8Array(res.data as ArrayBuffer);
}

export async function extractFromPendingFolder(
  folder: PendingFolder,
): Promise<ExtractedSpec> {
  const [salesOrderBytes, proofBytes] = await Promise.all([
    folder.files.salesOrder ? downloadPdf(folder.files.salesOrder.id) : Promise.resolve(null),
    folder.files.proof ? downloadPdf(folder.files.proof.id) : Promise.resolve(null),
  ]);

  const so = salesOrderBytes ? await parseSalesOrderPdf(salesOrderBytes) : null;
  const proofText = proofBytes ? await pdfBytesToText(proofBytes) : null;

  const sizeFromSo = so?.items.find((it) => it.width && it.height);
  const fallbackSize = sizeFromSo ? `${sizeFromSo.width} x ${sizeFromSo.height}` : null;

  // Spec extraction needs proof text at minimum to be useful. If no proof is
  // available, fall back to whatever the sales-order line items reveal.
  const spec = proofText
    ? await extractSpecWithClaude({
        proofText,
        salesOrderText: so?.rawText ?? null,
      })
    : {
        boardType: null,
        boardSize: fallbackSize,
        material: null,
        background: null,
        graphics: null,
        fixings: null,
        style: null,
        boardCount: so?.items.filter((it) => it.qty && it.qty > 0).reduce((n, it) => n + (it.qty ?? 0), 0) || 0,
      };

  return {
    soNumber: so?.soNumber ?? folder.soNumber,
    customerName: so?.customerName ?? folder.customerName,
    customerBrief: so?.customerBrief ?? null,
    customerAddress: so?.customerAddress ?? null,
    contactName: so?.contactName ?? null,
    contactEmail: so?.contactEmail ?? null,
    contactPhone: so?.contactPhone ?? null,
    orderDate: so?.orderDate ?? null,
    boardType: spec.boardType,
    boardSize: spec.boardSize ?? fallbackSize,
    material: spec.material,
    background: spec.background,
    graphics: spec.graphics,
    fixings: spec.fixings,
    style: spec.style,
    boardCount: spec.boardCount,
    salesOrder: so,
  };
}
