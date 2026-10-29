'use client';

import React from 'react';
import { ShieldCheck, Wifi, WifiOff } from 'lucide-react';
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
    <header className="sticky top-0 z-40 bg-brand-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
        {/* Brand & Room Info */}
        <div className="flex items-center space-x-2.5">
          <div className="bg-white/10 p-1.5 rounded-lg flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-blue-200" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-sm tracking-wide text-white">ACNABIN</span>
              <span className="text-[10px] font-semibold bg-brand-700 text-blue-100 px-1.5 py-0.5 rounded">FA Count</span>
            </div>
            <p className="text-[11px] text-blue-200 truncate max-w-[140px] sm:max-w-[220px]">
              {currentRoom}
            </p>
          </div>
        </div>

        {/* Sync, User Status & Logout */}
        <div className="flex items-center space-x-2">
          {/* Sync Status Badge */}
          {pendingSyncCount > 0 ? (
            <div className="flex items-center space-x-1 bg-amber-500/20 text-amber-200 border border-amber-400/30 px-2 py-1 rounded-full text-xs font-medium">
              <WifiOff className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>{pendingSyncCount}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-1 rounded-full text-xs font-medium">
              <Wifi className="w-3.5 h-3.5 text-emerald-300" />
              <span className="hidden sm:inline">Saved</span>
            </div>
          )}

          {/* User Role Pill */}
          <div className="text-right pl-1">
            <span className="text-xs font-medium text-white block leading-tight truncate max-w-[100px]">{userName}</span>
            <span className="text-[9px] font-bold text-blue-200 uppercase tracking-wider">{userRole}</span>
          </div>

          {/* One-touch Logout */}
          <LogoutButton variant="light" />
        </div>
      </div>
    </header>
  );
};
