import { getDriveClient } from '@/lib/drive/client';
import type { PendingFolder } from '@/lib/drive/folders';
import { tidySpecValue } from './normalise';
import { parseProofPdf, type ProofSummary } from './proof';
import { parseSalesOrderPdf, type SalesOrder } from './sales-order';

export type ExtractedSpec = {
  // From sales order
  soNumber: string | null;
  customerName: string | null;
  customerBrief: string | null;
  customerAddress: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  orderDate: string | null;

  // Canonical board spec (from proof, fallback to sales order)
  boardType: 'Wooden' | 'Acrylic' | 'Lettering' | null;
  boardSize: string | null;
  material: string | null;
  background: string | null;
  graphics: string | null;
  fixings: string | null;
  style: string | null;
  boardCount: number;

  // Underlying parsed objects (kept for debugging / detail views)
  salesOrder: SalesOrder | null;
  proof: ProofSummary | null;
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
  const so = folder.files.salesOrder
    ? await parseSalesOrderPdf(await downloadPdf(folder.files.salesOrder.id))
    : null;
  const proof = folder.files.proof
    ? await parseProofPdf(await downloadPdf(folder.files.proof.id))
    : null;

  const sizeFromSo = so?.items.find((it) => it.width && it.height);
  const fallbackSize = sizeFromSo ? `${sizeFromSo.width} x ${sizeFromSo.height}` : null;

  return {
    soNumber: so?.soNumber ?? folder.soNumber,
    customerName: so?.customerName ?? folder.customerName,
    customerBrief: so?.customerBrief ?? null,
    customerAddress: so?.customerAddress ?? null,
    contactName: so?.contactName ?? null,
    contactEmail: so?.contactEmail ?? null,
    contactPhone: so?.contactPhone ?? null,
    orderDate: so?.orderDate ?? null,
    boardType: proof?.canonical.boardType ?? null,
    boardSize: tidySpecValue(proof?.canonical.size ?? fallbackSize),
    material: tidySpecValue(proof?.canonical.material ?? null),
    background: tidySpecValue(proof?.canonical.background ?? null),
    graphics: tidySpecValue(proof?.canonical.graphics ?? null),
    fixings: tidySpecValue(proof?.canonical.fixings ?? null),
    style: tidySpecValue(proof?.canonical.style ?? null),
    boardCount: proof?.boards.length ?? 0,
    salesOrder: so,
    proof,
  };
}
