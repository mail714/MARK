import { createAdminClient } from './admin';

const BUCKET = 'case-study-photos';

let bucketEnsured = false;

async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (data) {
    bucketEnsured = true;
    return;
  }
  // 'Bucket not found' is the only error we want to handle here; rethrow others.
  if (error && !/not.found/i.test(error.message)) {
    throw new Error(`Failed to check Supabase bucket: ${error.message}`);
  }
  const create = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '20MB',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (create.error) throw new Error(`Failed to create Supabase bucket: ${create.error.message}`);
  bucketEnsured = true;
}

export async function uploadProcessedImage(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<{ path: string; publicUrl: string }> {
  await ensureBucket();
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`Failed to upload ${path}: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export function publicUrlForPath(path: string): string {
  const supabase = createAdminClient();
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
