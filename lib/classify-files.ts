// Client-side prediction of what role each file will land in once it's on
// Drive. Mirrors the server-side logic in lib/drive/folders.ts classifyFiles
// so the operator sees the same outcome inside the dialog before uploading.

export type PreviewRole = 'sales-order' | 'proof' | 'photo' | 'unidentified';

export type ClassifiedFile = {
  name: string;
  size: number;
  mimeType: string;
  role: PreviewRole;
};

const SALES_ORDER_RE = /(sales[-_ ]?order|^so[-_ ]|so\d)/i;
const PROOF_RE = /proof/i;

type ContextRoles = {
  // Roles already filled in the folder (used to drive the pair-up heuristic).
  hasSalesOrder?: boolean;
  hasProof?: boolean;
};

export function classifyForPreview(
  files: { name: string; size: number; type: string }[],
  context: ContextRoles = {},
): ClassifiedFile[] {
  const out: ClassifiedFile[] = files.map((f) => {
    const ext = f.name.toLowerCase();
    const isPdf = f.type === 'application/pdf' || ext.endsWith('.pdf');
    const isImage =
      f.type.startsWith('image/') ||
      ext.endsWith('.jpg') ||
      ext.endsWith('.jpeg') ||
      ext.endsWith('.png') ||
      ext.endsWith('.webp') ||
      ext.endsWith('.heic') ||
      ext.endsWith('.heif');

    let role: PreviewRole = 'unidentified';
    if (isImage) {
      role = 'photo';
    } else if (isPdf) {
      if (SALES_ORDER_RE.test(f.name)) role = 'sales-order';
      else if (PROOF_RE.test(f.name)) role = 'proof';
      else role = 'unidentified';
    }
    return {
      name: f.name,
      size: f.size,
      mimeType: f.type,
      role,
    };
  });

  // First-pass tallies (treat already-present roles as taken).
  let soSeen = context.hasSalesOrder ? 1 : 0;
  let proofSeen = context.hasProof ? 1 : 0;
  let orphanPdfs: ClassifiedFile[] = [];
  for (const f of out) {
    if (f.role === 'sales-order') soSeen++;
    else if (f.role === 'proof') proofSeen++;
    else if (f.role === 'unidentified' && f.mimeType === 'application/pdf') {
      orphanPdfs.push(f);
    }
  }

  // Pair-up fallback — same shape as the server logic: if one side is
  // identified and exactly one unlabelled PDF sits alongside, treat it as
  // the missing pair.
  if (orphanPdfs.length === 1) {
    if (soSeen >= 1 && proofSeen === 0) {
      orphanPdfs[0].role = 'proof';
    } else if (proofSeen >= 1 && soSeen === 0) {
      orphanPdfs[0].role = 'sales-order';
    }
  }

  return out;
}

export function roleLabel(role: PreviewRole): string {
  switch (role) {
    case 'sales-order':
      return 'Sales order';
    case 'proof':
      return 'Proof';
    case 'photo':
      return 'Photo';
    case 'unidentified':
      return 'Unidentified PDF';
  }
}

export function roleTone(role: PreviewRole): string {
  switch (role) {
    case 'sales-order':
    case 'proof':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'photo':
      return 'bg-blue-50 text-blue-700 ring-blue-200';
    case 'unidentified':
      return 'bg-amber-50 text-amber-800 ring-amber-200';
  }
}
