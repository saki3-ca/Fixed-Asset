import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireRole } from '@/lib/auth/requireRole';

export async function POST(request: Request) {
  const auth = await requireRole(['admin']);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const usersToInvite: Array<{ email: string; name: string; role: string }> = 
      Array.isArray(body.users) 
        ? body.users 
        : [{ email: body.email, name: body.name, role: body.role }];

    if (!usersToInvite || usersToInvite.length === 0) {
      return NextResponse.json({ error: 'No user data provided' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    // Invite and reset links land on this deployment's set-password page
    const origin = new URL(request.url).origin;
    const results: Array<{ email: string; status: 'invited' | 'exists_updated' | 'failed'; message?: string }> = [];

    for (const item of usersToInvite) {
      const email = (item.email || '').trim().toLowerCase();
      const name = item.name?.trim() || email.split('@')[0];
      const role = ['admin', 'team_lead', 'counter', 'reviewer', 'manager'].includes(item.role)
        ? item.role
        : 'counter';

      if (!email || !email.includes('@')) {
        results.push({ email: email || 'unknown', status: 'failed', message: 'Invalid email address' });
        continue;
      }

      try {
        // 1. Send invite email via Supabase Admin API
        const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
          data: {
            full_name: name,
          },
          redirectTo: `${origin}/auth/set-password`,
        });

        if (inviteError) {
          // If already registered, update their role and profile instead of failing
          if (inviteError.message.toLowerCase().includes('already registered') || inviteError.message.toLowerCase().includes('already exists')) {
            const { data: listData } = await adminSupabase.auth.admin.listUsers();
            const existingUser = listData?.users.find((u) => u.email?.toLowerCase() === email);

            if (existingUser) {
              await adminSupabase.from('profiles').upsert({
                id: existingUser.id,
                email,
                full_name: name,
                role,
                active: true,
              });

              results.push({ email, status: 'exists_updated', message: 'User already existed; profile and role updated' });
              continue;
            }
          }

          results.push({ email, status: 'failed', message: inviteError.message });
          continue;
        }

        // 2. Insert/Upsert into public.profiles
        if (inviteData?.user?.id) {
          await adminSupabase.from('profiles').upsert({
            id: inviteData.user.id,
            email,
            full_name: name,
            role,
            active: true,
          });
        }

        results.push({ email, status: 'invited', message: 'Invite email sent successfully' });
      } catch (userErr: unknown) {
        const err = userErr as Error;
        results.push({ email, status: 'failed', message: err.message || 'Unknown error' });
      }
    }

    const successful = results.filter((r) => r.status === 'invited' || r.status === 'exists_updated').length;

    return NextResponse.json({
      success: true,
      processed: results.length,
      successful,
      results,
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Invite API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process user invitations' }, { status: 500 });
  }
}

