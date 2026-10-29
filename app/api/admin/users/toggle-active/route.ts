import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/requireRole';

export async function POST(request: Request) {
  const auth = await requireRole(['admin']);
  if (!auth.ok) return auth.response;
  try {
    const { userId, active } = await request.json();

    if (!userId || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'User ID and active status required' }, { status: 400 });
    }

    if (userId === auth.userId && active === false) {
      return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // Update active status in public.profiles (never hard delete)
    const { error: profileErr } = await adminSupabase
      .from('profiles')
      .update({ active, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (profileErr) {
      throw new Error(profileErr.message);
    }

    return NextResponse.json({
      success: true,
      userId,
      active,
      message: active ? 'User reactivated successfully' : 'User deactivated successfully (preserved for audit)',
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Toggle active error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update user status' }, { status: 500 });
  }
}

