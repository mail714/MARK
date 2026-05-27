import { createAdminClient } from '@/lib/supabase/admin';
import { uploadProcessedImage } from '@/lib/supabase/storage';
import { downloadDriveFile } from '@/lib/drive/download';
import { listPendingFolders, type DriveFile } from '@/lib/drive/folders';
import { makeVisionThumb, resizeToHero } from '@/lib/images/process';
import { pickHeroAndDetailImages, type VisionCandidate } from '@/lib/ai/vision';
import type { CaseStudy } from '@/lib/types';

export type CaseStudyPhoto = {
  id: string;
  case_study_id: string;
  drive_file_id: string;
  original_filename: string | null;
  role: 'main' | 'image_2' | 'candidate';
  alt_text: string | null;
  processed_storage_path: string | null;
  processed_public_url: string | null;
  wix_media_url: string | null;
  selected: boolean;
  width: number | null;
  height: number | null;
  created_at: string;
};

type PhotoRow = Omit<CaseStudyPhoto, 'processed_public_url'>;

async function getCaseStudyOrThrow(id: string): Promise<CaseStudy> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('case_studies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load case study: ${error.message}`);
  if (!data) throw new Error(`Case study ${id} not found`);
  return data as CaseStudy;
}

async function findDriveFolder(cs: CaseStudy): Promise<{ photos: DriveFile[] } | null> {
  const rootId = process.env.HONOURS_BOARDS_DRIVE_ROOT_ID;
  if (!rootId) throw new Error('HONOURS_BOARDS_DRIVE_ROOT_ID is not set');
  const folders = await listPendingFolders(rootId);
  const folder = folders.find((f) => f.id === cs.drive_folder_id);
  if (!folder) return null;
  return { photos: folder.files.photos };
}

function withPublicUrl(row: PhotoRow): CaseStudyPhoto {
  if (!row.processed_storage_path) {
    return { ...row, processed_public_url: null };
  }
  // Public URL is derived deterministically from the path; resolve here so
  // callers don't need a Supabase client.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
  return {
    ...row,
    processed_public_url: `${base}/storage/v1/object/public/case-study-photos/${row.processed_storage_path}`,
  };
}

export async function getCaseStudyPhotos(caseStudyId: string): Promise<CaseStudyPhoto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('case_study_photos')
    .select('*')
    .eq('case_study_id', caseStudyId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to load photos: ${error.message}`);
  return (data as PhotoRow[]).map(withPublicUrl);
}

export async function processPhotosForCaseStudy(caseStudyId: string): Promise<void> {
  const cs = await getCaseStudyOrThrow(caseStudyId);
  const folder = await findDriveFolder(cs);
  if (!folder || folder.photos.length === 0) {
    throw new Error('No photos found in the Drive job folder.');
  }

  const supabase = createAdminClient();

  // Wipe previous photo rows for this case study — operator is opting into a
  // fresh pass. Storage files get overwritten via upsert so left-overs from a
  // previous run don't leak through.
  await supabase.from('case_study_photos').delete().eq('case_study_id', caseStudyId);

  // 1. Download + resize all photos, upload 1200x900 versions to storage,
  //    keep originals in memory only long enough to also produce a vision
  //    thumbnail.
  const visionCandidates: VisionCandidate[] = [];
  const rowsToInsert: Omit<PhotoRow, 'id' | 'created_at'>[] = [];

  for (const photo of folder.photos) {
    const original = await downloadDriveFile(photo.id);
    const [hero, thumb] = await Promise.all([
      resizeToHero(Buffer.from(original)),
      makeVisionThumb(Buffer.from(original)),
    ]);
    const storagePath = `${caseStudyId}/${photo.id}.jpg`;
    await uploadProcessedImage(storagePath, hero.buffer, hero.contentType);
    visionCandidates.push({
      driveFileId: photo.id,
      originalFilename: photo.name,
      thumbBase64: thumb.buffer.toString('base64'),
      thumbContentType: 'image/jpeg',
    });
    rowsToInsert.push({
      case_study_id: caseStudyId,
      drive_file_id: photo.id,
      original_filename: photo.name,
      role: 'candidate',
      alt_text: null,
      processed_storage_path: storagePath,
      wix_media_url: null,
      selected: false,
      width: hero.width,
      height: hero.height,
    });
  }

  // 2. Insert all rows so they exist before we annotate the selections.
  const { data: inserted, error: insertErr } = await supabase
    .from('case_study_photos')
    .insert(rowsToInsert)
    .select('id, drive_file_id');
  if (insertErr) throw new Error(`Failed to insert photo rows: ${insertErr.message}`);
  const idByDriveId = new Map(
    (inserted as { id: string; drive_file_id: string }[]).map((r) => [r.drive_file_id, r.id]),
  );

  // 3. Ask Claude vision which two to feature + write alt text.
  const selection = await pickHeroAndDetailImages(visionCandidates, {
    customer_name: cs.customer_name,
    board_type: cs.board_type,
    club_types: cs.club_types,
  });
  const mainCandidate = visionCandidates[selection.mainIndex];
  const image2Candidate = visionCandidates[selection.image2Index];

  await supabase
    .from('case_study_photos')
    .update({ role: 'main', selected: true, alt_text: selection.mainAltText })
    .eq('id', idByDriveId.get(mainCandidate.driveFileId));

  if (image2Candidate.driveFileId !== mainCandidate.driveFileId) {
    await supabase
      .from('case_study_photos')
      .update({ role: 'image_2', selected: true, alt_text: selection.image2AltText })
      .eq('id', idByDriveId.get(image2Candidate.driveFileId));
  }
}

// Promote an existing candidate row into the 'main' or 'image_2' slot.
// Demotes whatever currently holds that slot back to 'candidate'.
export async function setPhotoRole(
  caseStudyId: string,
  photoId: string,
  role: 'main' | 'image_2',
  altText?: string | null,
): Promise<void> {
  const supabase = createAdminClient();
  // Demote current holder of this slot.
  const { error: demoteErr } = await supabase
    .from('case_study_photos')
    .update({ role: 'candidate', selected: false })
    .eq('case_study_id', caseStudyId)
    .eq('role', role);
  if (demoteErr) throw new Error(`Failed to demote previous ${role}: ${demoteErr.message}`);

  const update: Partial<PhotoRow> = { role, selected: true };
  if (altText !== undefined) update.alt_text = altText;
  const { error } = await supabase
    .from('case_study_photos')
    .update(update)
    .eq('id', photoId)
    .eq('case_study_id', caseStudyId);
  if (error) throw new Error(`Failed to promote photo: ${error.message}`);
}

export async function updatePhotoAlt(
  caseStudyId: string,
  photoId: string,
  altText: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('case_study_photos')
    .update({ alt_text: altText })
    .eq('id', photoId)
    .eq('case_study_id', caseStudyId);
  if (error) throw new Error(`Failed to update alt text: ${error.message}`);
}
