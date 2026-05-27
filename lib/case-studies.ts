import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandBySlug } from '@/lib/brands';
import { listPendingFolders, type PendingFolder } from '@/lib/drive/folders';
import { extractFromPendingFolder } from '@/lib/pdf/extract';
import type { CaseStudy } from '@/lib/types';

export type PendingFolderWithStatus = PendingFolder & {
  caseStudy: Pick<CaseStudy, 'id' | 'status'> | null;
};

export async function getHonoursBoardsPendingFolders(): Promise<PendingFolderWithStatus[]> {
  const brand = await getBrandBySlug('honours-boards');
  const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;
  if (!rootId) throw new Error('HONOURS_BOARDS_DRIVE_ROOT_ID is not set');

  const [folders, supabase] = [await listPendingFolders(rootId), createAdminClient()];

  const folderIds = folders.map((f) => f.id);
  const { data: existing, error } = folderIds.length
    ? await supabase
        .from('case_studies')
        .select('id, status, drive_folder_id')
        .eq('brand_id', brand.id)
        .in('drive_folder_id', folderIds)
    : { data: [], error: null };
  if (error) throw new Error(`Failed to load case studies: ${error.message}`);

  const byFolder = new Map(
    (existing ?? []).map((row) => [
      row.drive_folder_id as string,
      { id: row.id as string, status: row.status as CaseStudy['status'] },
    ]),
  );

  return folders.map((f) => ({ ...f, caseStudy: byFolder.get(f.id) ?? null }));
}

export async function getCaseStudy(id: string): Promise<CaseStudy | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('case_studies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load case study: ${error.message}`);
  return (data as CaseStudy | null) ?? null;
}

export async function generateCaseStudyForFolder(driveFolderId: string): Promise<string> {
  const brand = await getBrandBySlug('honours-boards');
  const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;
  if (!rootId) throw new Error('HONOURS_BOARDS_DRIVE_ROOT_ID is not set');

  const folders = await listPendingFolders(rootId);
  const folder = folders.find((f) => f.id === driveFolderId);
  if (!folder) throw new Error(`Drive folder ${driveFolderId} not in 1-Pending`);

  const supabase = createAdminClient();

  // Insert (or grab) a placeholder row in generating state.
  const upserted = await supabase
    .from('case_studies')
    .upsert(
      {
        brand_id: brand.id,
        drive_folder_id: folder.id,
        drive_folder_name: folder.name,
        status: 'generating',
      },
      { onConflict: 'brand_id,drive_folder_id' },
    )
    .select('id')
    .single();
  if (upserted.error) throw new Error(`Failed to create case study: ${upserted.error.message}`);
  const caseStudyId = upserted.data.id as string;

  try {
    const spec = await extractFromPendingFolder(folder);

    const update = await supabase
      .from('case_studies')
      .update({
        status: 'draft',
        so_number: spec.soNumber,
        customer_name: spec.customerName,
        board_type: spec.boardType,
        board_size: spec.boardSize,
        back_colour: spec.background,
        text_colour: spec.graphics,
        edge_details: spec.style,
        fixings: spec.fixings,
        generated_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', caseStudyId);
    if (update.error) throw new Error(`Failed to save extracted spec: ${update.error.message}`);

    return caseStudyId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('case_studies')
      .update({ status: 'failed', last_error: message })
      .eq('id', caseStudyId);
    throw err;
  }
}

export async function updateCaseStudyFields(
  id: string,
  fields: Partial<Pick<
    CaseStudy,
    | 'customer_name'
    | 'so_number'
    | 'board_type'
    | 'board_size'
    | 'back_colour'
    | 'text_colour'
    | 'edge_details'
    | 'fixings'
    | 'club_types'
  >>,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('case_studies').update(fields).eq('id', id);
  if (error) throw new Error(`Failed to update case study: ${error.message}`);
}
