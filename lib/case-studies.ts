import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandBySlug } from '@/lib/brands';
import { trashFolder } from '@/lib/drive/delete';
import { listPendingFolders, type PendingFolder } from '@/lib/drive/folders';
import { extractFromPendingFolder } from '@/lib/pdf/extract';
import { draftCaseStudy } from '@/lib/ai/draft';
import type { CaseStudy } from '@/lib/types';

export type PendingFolderWithStatus = PendingFolder & {
  caseStudy: Pick<CaseStudy, 'id' | 'status'> | null;
};

export type CompletedCaseStudy = Pick<
  CaseStudy,
  | 'id'
  | 'status'
  | 'drive_folder_id'
  | 'drive_folder_name'
  | 'customer_name'
  | 'so_number'
  | 'published_at'
  | 'wix_published_url'
>;

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

// Case studies whose Drive folder is NOT currently in 1-Pending (i.e. they've
// been published, or the folder was archived/moved/deleted). Ordered most
// recent first. Paged + searchable.
export async function getCompletedCaseStudies(args: {
  excludeDriveFolderIds: string[];
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<{
  items: CompletedCaseStudy[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const brand = await getBrandBySlug('honours-boards');
  const supabase = createAdminClient();
  const pageSize = args.pageSize ?? 15;
  const page = Math.max(1, args.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('case_studies')
    .select(
      'id, status, drive_folder_id, drive_folder_name, customer_name, so_number, published_at, wix_published_url',
      { count: 'exact' },
    )
    .eq('brand_id', brand.id);

  if (args.excludeDriveFolderIds.length) {
    query = query.filter(
      'drive_folder_id',
      'not.in',
      `(${args.excludeDriveFolderIds.map((id) => `"${id}"`).join(',')})`,
    );
  }

  const q = args.search?.trim();
  if (q) {
    // Escape PostgREST ilike wildcards so a typed % doesn't break the search.
    const safe = q.replace(/[%_,]/g, (c) => `\\${c}`);
    query = query.or(
      `customer_name.ilike.%${safe}%,drive_folder_name.ilike.%${safe}%,so_number.ilike.%${safe}%`,
    );
  }

  query = query
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to load completed case studies: ${error.message}`);
  return {
    items: (data as CompletedCaseStudy[]) ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };
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

export async function draftCopyForCaseStudy(id: string): Promise<void> {
  const cs = await getCaseStudy(id);
  if (!cs) throw new Error(`Case study ${id} not found`);

  const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;
  if (!rootId) throw new Error('HONOURS_BOARDS_DRIVE_ROOT_ID is not set');

  // Re-fetch the Drive folder + PDFs. Acceptable cost for now; if generation
  // turns out to be a hot path we can stash the spec in the case_studies row
  // when extract runs.
  const folders = await listPendingFolders(rootId);
  const folder = folders.find((f) => f.id === cs.drive_folder_id);
  if (!folder) {
    throw new Error(
      `Drive folder ${cs.drive_folder_id} no longer in 1-Pending — has it been moved?`,
    );
  }
  const spec = await extractFromPendingFolder(folder);

  const supabase = createAdminClient();
  try {
    const fields = await draftCaseStudy(spec, {
      club_types: cs.club_types,
      customer_name: cs.customer_name,
    });
    const { error } = await supabase
      .from('case_studies')
      .update({ ...fields, last_error: null })
      .eq('id', id);
    if (error) throw new Error(`Failed to save draft copy: ${error.message}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('case_studies')
      .update({ last_error: message })
      .eq('id', id);
    throw err;
  }
}

// Wipe a case study from MARK and trash its Drive folder. Removes processed
// photos from Supabase Storage, deletes the case_studies row (which cascades
// to case_study_photos and social_posts via FK), and trashes the Drive folder
// (which cascades to all contents). Wix items are NOT touched — use the
// existing Reset Wix link button first if you also want the live item gone.
export async function deleteByDriveFolderId(driveFolderId: string): Promise<{
  driveTrashed: boolean;
  caseStudyDeleted: boolean;
}> {
  const supabase = createAdminClient();

  // Find any case study associated with this folder so we can clean up
  // dependent storage objects before the cascade fires.
  const { data: existing, error: lookupErr } = await supabase
    .from('case_studies')
    .select('id')
    .eq('drive_folder_id', driveFolderId)
    .maybeSingle();
  if (lookupErr) throw new Error(`Failed to look up case study: ${lookupErr.message}`);

  let caseStudyDeleted = false;
  if (existing) {
    const { data: photos } = await supabase
      .from('case_study_photos')
      .select('processed_storage_path')
      .eq('case_study_id', existing.id);
    const paths = (photos ?? [])
      .map((p) => p.processed_storage_path as string | null)
      .filter((p): p is string => !!p);
    if (paths.length) {
      const rm = await supabase.storage.from('case-study-photos').remove(paths);
      if (rm.error) {
        // Storage delete failures shouldn't block the DB cascade — log the
        // path and keep going. Worst case is a few orphaned blobs.
        console.warn('Failed to remove some storage objects:', rm.error.message);
      }
    }
    const del = await supabase.from('case_studies').delete().eq('id', existing.id);
    if (del.error) throw new Error(`Failed to delete case study row: ${del.error.message}`);
    caseStudyDeleted = true;
  }

  // Trash the Drive folder last so failures upstream don't leave the folder
  // gone with DB rows still pointing at it.
  try {
    await trashFolder(driveFolderId);
    return { driveTrashed: true, caseStudyDeleted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 404 means the folder is already gone — treat as success.
    if (/not found|404/i.test(message)) {
      return { driveTrashed: false, caseStudyDeleted };
    }
    throw new Error(`Failed to trash Drive folder: ${message}`);
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
    | 'h1_page_title'
    | 'h1_introduction_text'
    | 'h2_design_highlights_title'
    | 'h2_design_highlights_text'
    | 'h2_summary_title'
    | 'h2_summary_text'
    | 'cta_text'
    | 'page_meta_title'
    | 'page_meta_description'
    | 'schema_title'
    | 'schema_desc'
  >>,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('case_studies').update(fields).eq('id', id);
  if (error) throw new Error(`Failed to update case study: ${error.message}`);
}
