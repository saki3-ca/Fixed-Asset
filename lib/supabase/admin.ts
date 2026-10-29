import { createClient } from '@supabase/supabase-js';

// Server-side only client with service role key for admin actions (e.g., FAR bulk imports, creating users)
// This file is strictly excluded from client-side bundles and runs solely in server actions / API routes.
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase URL or Service Role Key is not configured on the server.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

