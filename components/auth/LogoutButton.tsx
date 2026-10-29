'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Loader2 } from 'lucide-react';

interface LogoutButtonProps {
  className?: string;
  variant?: 'light' | 'dark';
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({ 
  className = '',
  variant = 'light'
}) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
      // Fallback
      window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  const baseStyle = variant === 'light'
    ? 'text-white/80 hover:text-white hover:bg-white/10 active:bg-white/20'
    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 border border-slate-200';

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      aria-label="Log out"
      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors ${baseStyle} ${className}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <LogOut className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">Logout</span>
    </button>
  );
};

