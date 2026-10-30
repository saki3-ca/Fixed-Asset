'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Briefcase,
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  MapPin,
  Upload,
  Users,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface TopBarProps {
  /** Room / context line shown under the logo */
  currentRoom?: string;
  /** Optional overrides; by default the bar loads the signed-in user itself. */
  userRole?: string;
  userName?: string;
  pendingSyncCount?: number;
}

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
}

// Order matters: the first four allowed items become the phone's bottom tabs, the rest live in the "Me" sheet.
// Admins therefore reach every screen from one place, which is how an admin switches between field and control views.
const NAV_ITEMS: NavItem[] = [
  { label: 'Count', href: '/count', icon: ListChecks, roles: ['admin', 'team_lead', 'counter'] },
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['admin', 'team_lead', 'reviewer', 'manager'] },
  { label: 'Review', href: '/review', icon: ClipboardCheck, roles: ['admin', 'team_lead', 'reviewer', 'manager'] },
  { label: 'Locations', href: '/count/locations', icon: MapPin, roles: ['admin', 'team_lead', 'counter'] },
  { label: 'Room setup', href: '/admin/locations', icon: Briefcase, roles: ['admin', 'team_lead'] },
  { label: 'Users', href: '/admin/users', icon: Users, roles: ['admin'] },
  { label: 'Engagement', href: '/admin/engagement', icon: Briefcase, roles: ['admin'] },
  { label: 'Import FAR', href: '/admin/import', icon: Upload, roles: ['admin'] },
];

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  team_lead: 'Team Lead',
  counter: 'Counter',
  reviewer: 'Reviewer',
  manager: 'Manager',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

export const TopBar: React.FC<TopBarProps> = ({ currentRoom, userRole, userName, pendingSyncCount = 0 }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<{ name: string; role: string } | null>(null);
  const [online, setOnline] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single();
      if (!cancelled) {
        setProfile({
          name: data?.full_name || user.email?.split('@')[0] || 'User',
          role: data?.role || 'counter',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Leave room for the floating tab bar on phones
  useEffect(() => {
    document.body.classList.add('has-bottom-nav');
    return () => document.body.classList.remove('has-bottom-nav');
  }, []);

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const name = userName || profile?.name || '';
  const role = userRole || profile?.role || '';
  const items = NAV_ITEMS.filter((i) => role && i.roles.includes(role));
  const tabs = items.slice(0, 4);

  const isActive = (href: string) =>
    pathname === href || (href !== '/count' && pathname.startsWith(href + '/'));

  const signOut = async () => {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
      router.push('/login');
      router.refresh();
    } catch {
      window.location.href = '/login';
    }
  };

  const status = !online
    ? { label: 'Offline', tone: 'text-amber-700', Icon: WifiOff }
    : pendingSyncCount > 0
    ? { label: `${pendingSyncCount} waiting to sync`, tone: 'text-amber-700', Icon: WifiOff }
    : { label: 'Online', tone: 'text-brand-700', Icon: Wifi };

  const avatar = (size: string) => (
    <span
      className={`${size} rounded-full bg-mint text-brand-800 font-display font-semibold flex items-center justify-center shrink-0`}
    >
      {name ? initials(name) : '·'}
    </span>
  );

  return (
    <>
      {/* ---------- Top bar ---------- */}
      <header className="sticky top-0 z-40 bg-cream/95 backdrop-blur border-b border-slate-300/70">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 min-w-0" aria-label="ACNABIN FA Count home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/acnabin-logo.png" alt="ACNABIN" className="h-8 w-auto object-contain shrink-0" />
          </Link>

          {/* Desktop tabs */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 h-10 rounded-full flex items-center gap-2 text-sm font-semibold transition-colors ${
                    active ? 'bg-brand-100 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <span
              className={`hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-full bg-white border border-slate-300/70 text-xs font-semibold ${status.tone}`}
            >
              <status.Icon size={14} />
              {status.label}
            </span>
            <button
              onClick={() => setSheetOpen(true)}
              aria-label="Account and navigation"
              className="flex items-center gap-2 rounded-full pl-1 pr-1 md:pr-3 h-11 bg-white border border-slate-300/70 shadow-soft"
              style={{ minHeight: 44 }}
            >
              {avatar('w-9 h-9 text-sm')}
              <span className="hidden md:block text-sm font-semibold text-slate-900 max-w-[240px] truncate">{name}</span>
            </button>
          </div>
        </div>

        {currentRoom && (
          <div className="max-w-7xl mx-auto px-4 pb-2 -mt-1 flex items-center gap-1.5 text-xs text-slate-600">
            <MapPin size={12} className="text-brand-600 shrink-0" />
            <span className="truncate">{currentRoom}</span>
          </div>
        )}
      </header>

      {/* ---------- Floating bottom tabs (phones) ---------- */}
      <nav
        className="md:hidden fixed z-40 left-3 right-3 bottom-3 pb-[env(safe-area-inset-bottom)]"
        aria-label="Main"
      >
        <div className="bg-white/95 backdrop-blur border border-slate-300/70 rounded-full shadow-float p-1.5 flex items-stretch justify-around gap-1">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 min-h-[52px] rounded-full flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold transition-colors ${
                  active ? 'bg-brand-100 text-brand-700' : 'text-slate-500'
                }`}
              >
                <Icon size={20} />
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex-1 min-h-[52px] rounded-full flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold text-slate-500"
            style={{ minHeight: 52 }}
          >
            {avatar('w-6 h-6 text-[10px]')}
            <span className="leading-none">Me</span>
          </button>
        </div>
      </nav>

      {/* ---------- Account sheet (bottom sheet on phones, dropdown on desktop) ---------- */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Close menu"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 w-full h-full bg-slate-900/40 backdrop-blur-[2px] cursor-default"
            style={{ minHeight: 0 }}
          />
          <div
            className="absolute inset-x-0 bottom-0 md:inset-x-auto md:right-4 md:top-16 md:bottom-auto md:w-[360px]
                       bg-cream rounded-t-3xl md:rounded-3xl shadow-float border border-slate-300/70 max-h-[88vh] overflow-y-auto no-scrollbar
                       pb-[calc(16px+env(safe-area-inset-bottom))]"
            role="dialog"
            aria-label="Account and navigation"
          >
            <div className="flex items-center gap-3 p-4">
              {avatar('w-12 h-12 text-base')}
              <div className="min-w-0 flex-1">
                <div className="font-display text-lg font-semibold text-slate-900 leading-tight break-words">{name}</div>
                {role && (
                  <span className="inline-block mt-1 text-[10.5px] font-bold uppercase tracking-wide text-brand-700 bg-brand-100 px-2.5 py-0.5 rounded-full">
                    {ROLE_LABEL[role] || role}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="w-10 h-10 rounded-full bg-white border border-slate-300/70 flex items-center justify-center"
                style={{ minHeight: 40 }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Go to</div>
            <div className="mx-3 bg-white rounded-2xl border border-slate-300/60 shadow-soft overflow-hidden">
              {items.map((item, idx) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 min-h-[56px] ${idx > 0 ? 'border-t border-slate-200' : ''} ${
                      active ? 'bg-brand-50' : ''
                    }`}
                  >
                    <span className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-brand-700 shrink-0">
                      <Icon size={18} />
                    </span>
                    <span className={`flex-1 text-sm ${active ? 'font-bold text-brand-700' : 'font-medium text-slate-900'}`}>
                      {item.label}
                    </span>
                    <ChevronRight size={16} className="text-slate-400" />
                  </Link>
                );
              })}
            </div>

            <div className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Account</div>
            <div className="mx-3 bg-white rounded-2xl border border-slate-300/60 shadow-soft overflow-hidden">
              <div className="flex items-center gap-3 px-3 min-h-[56px]">
                <span className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <status.Icon size={18} className={status.tone} />
                </span>
                <span className="flex-1 text-sm font-medium text-slate-900">Connection</span>
                <span className={`text-xs font-semibold ${status.tone}`}>{status.label}</span>
              </div>
              <button
                onClick={signOut}
                disabled={signingOut}
                className="w-full flex items-center gap-3 px-3 min-h-[56px] border-t border-slate-200 text-left"
              >
                <span className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-red-700 shrink-0">
                  {signingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
                </span>
                <span className="flex-1 text-sm font-semibold text-red-700">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
