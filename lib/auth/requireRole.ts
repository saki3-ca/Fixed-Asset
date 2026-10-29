import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';

type Allowed = { ok: true; userId: string; role: UserRole } | { ok: false; response: NextResponse };

// Server-side gate for API routes: the caller must be signed in, active, and hold one of `roles`.
export async function requireRole(roles: UserRole[]): Promise<Allowed> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.active || !roles.includes(profile.role as UserRole)) {
    return { ok: false, response: NextResponse.json({ error: 'Not authorised' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, role: profile.role as UserRole };
}
