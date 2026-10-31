import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Which roles may open which page trees. Anything not listed is open to any signed-in user.
const PAGE_ACCESS: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/admin/locations', roles: ['admin', 'manager'] },
  { prefix: '/admin', roles: ['admin'] },
  { prefix: '/review', roles: ['admin', 'manager'] },
  { prefix: '/dashboard', roles: ['admin', 'manager'] },
  { prefix: '/count', roles: ['admin', 'manager', 'counter'] },
];

function homeFor(role: string) {
  return role === 'counter' ? '/count' : '/dashboard';
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Gracefully handle unconfigured / placeholder environment in initial dev
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLoginPage = pathname === '/login';
  const isAuthPage = pathname.startsWith('/auth');
  const isApi = pathname.startsWith('/api');

  // Not signed in
  if (!user) {
    if (isLoginPage || isAuthPage) return supabaseResponse;
    if (isApi) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Signed in: the invite / password-reset page must stay reachable
  if (isAuthPage) return supabaseResponse;

  // Role + active check for every signed-in request
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    if (isApi) return NextResponse.json({ error: 'Account deactivated' }, { status: 403 });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '?error=deactivated';
    return NextResponse.redirect(url);
  }

  // Already signed in and visiting the login page: go to the role's home
  if (isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = homeFor(profile.role);
    url.search = '';
    return NextResponse.redirect(url);
  }

  // API routes do their own role checks (requireRole)
  if (isApi) return supabaseResponse;

  const rule = PAGE_ACCESS.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/')
  );
  if (rule && !rule.roles.includes(profile.role)) {
    const url = request.nextUrl.clone();
    url.pathname = homeFor(profile.role);
    url.search = '';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
