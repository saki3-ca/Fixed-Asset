import { createClient } from '@/lib/supabase/client';

export interface MyProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
}

// One profile lookup per signed-in user, shared by the top bar and every page.
// The session is read locally from the cookie (no network); the server and RLS enforce the real access rules.
let cached: { id: string; promise: Promise<MyProfile | null> } | null = null;

export async function getMyProfile(): Promise<MyProfile | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    cached = null;
    return null;
  }
  if (cached?.id === user.id) return cached.promise;

  const promise = (async () => {
    const { data } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single();
    if (!data) {
      cached = null;
      return null;
    }
    return { id: user.id, email: user.email ?? null, full_name: data.full_name, role: data.role } as MyProfile;
  })();
  cached = { id: user.id, promise };
  return promise;
}

export function clearMyProfile() {
  cached = null;
}
