// One-off connectivity check. Run with: node --env-file=.env.local scripts/check-supabase.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from('brands')
  .select('slug, name')
  .order('slug');

if (error) {
  if (error.code === '42P01') {
    console.log('✓ Connected. brands table does not exist yet — run migrations.');
    process.exit(0);
  }
  console.error('✗ Error:', error);
  process.exit(1);
}

console.log('✓ Connected. brands rows:', data);
