'use client';

import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { LogoutButton } from '@/components/auth/LogoutButton';

interface TopBarProps {
  currentRoom?: string;
  userRole?: string;
  userName?: string;
  isOnline?: boolean;
  pendingSyncCount?: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentRoom = 'Room Not Selected',
  userRole = 'Counter',
  userName = 'Auditor',
  isOnline = true,
  pendingSyncCount = 0,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-cream border-b border-slate-300 text-slate-900 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
        {/* Brand & Room Info */}
        <div className="flex items-center space-x-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/acnabin-logo.png"
            alt="ACNABIN Chartered Accountants"
            className="h-9 w-auto object-contain"
          />
          <div className="border-l border-slate-300 pl-3">
            <span className="font-display font-extrabold text-sm text-brand-700 leading-none block">FA Count</span>
            <p className="text-[11px] text-slate-600 truncate max-w-[120px] sm:max-w-[220px]">
              {currentRoom}
            </p>
          </div>
        </div>

        {/* Sync, User Status & Logout */}
        <div className="flex items-center space-x-2">
          {/* Sync Status Badge */}
          {pendingSyncCount > 0 ? (
            <div className="flex items-center space-x-1 bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-full text-xs font-medium">
              <WifiOff className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span>{pendingSyncCount}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-full text-xs font-medium">
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Saved</span>
            </div>
          )}

          {/* User Role Pill */}
          <div className="text-right pl-1">
            <span className="text-xs font-semibold text-slate-900 block leading-tight truncate max-w-[100px]">{userName}</span>
            <span className="text-[9px] font-bold text-navy uppercase tracking-wider">{userRole}</span>
          </div>

          {/* One-touch Logout */}
          <LogoutButton variant="dark" />
        </div>
      </div>
    </header>
  );
};
