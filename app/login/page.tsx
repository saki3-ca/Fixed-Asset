'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ShieldCheck, Lock, Mail, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        // Fetch user's role from public.profiles
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, full_name, active')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) {
          // If profile table hasn't populated yet, default to /count
          router.push('/count');
        } else if (!profile.active) {
          setErrorMsg('Your account has been deactivated. Please contact the Lead Auditor.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        } else if (profile.role === 'counter') {
          // Route counters directly to mobile count & scanner
          router.push('/count');
        } else {
          // Route admin, reviewer, team_lead, manager to dashboard
          router.push('/dashboard');
        }
        router.refresh();
      }
    } catch (err: unknown) {
      const error = err as Error;
      // Friendly message for auditors
      if (error.message?.includes('Invalid login credentials')) {
        setErrorMsg('Invalid email or password. Please double check your credentials.');
      } else if (error.message?.includes('fetch failed') || error.message?.includes('Failed to fetch')) {
        setErrorMsg('Cannot reach Supabase. Please ensure your NEXT_PUBLIC_SUPABASE_URL and KEY are set in .env.local.');
      } else {
        setErrorMsg(error.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* App Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-800 text-white shadow-lg ring-4 ring-blue-100">
            <ShieldCheck className="w-8 h-8 text-blue-200" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            ACNABIN <span className="text-brand-700">FA Count</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Fixed Asset Physical Count &amp; Verification App
          </p>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-7 px-5 sm:px-8 shadow-sm rounded-2xl border border-slate-200">
          <form className="space-y-4" onSubmit={handleLogin}>
            {/* Error Notification */}
            {errorMsg && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2.5 text-rose-800 text-xs animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label 
                htmlFor="email" 
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Auditor Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="auditor@acnabin.com"
                  className="block w-full min-h-[48px] pl-11 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600 focus:border-brand-600 text-slate-900 placeholder:text-slate-400 transition-all"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label 
                htmlFor="password" 
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full min-h-[48px] pl-11 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600 focus:border-brand-600 text-slate-900 placeholder:text-slate-400 transition-all"
                />
              </div>
            </div>

            {/* Submit Button - Min 48px touch target */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[50px] flex items-center justify-center px-4 py-3 bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-60 text-sm"
              >
                {loading ? (
                  <span className="flex items-center space-x-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </span>
                ) : (
                  'Sign In to Engagement'
                )}
              </button>
            </div>
          </form>

          {/* Auditor Note */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-500">
              Role routing: <strong>Counters</strong> open the mobile scanner directly. <strong>Team Leads, Reviewers &amp; Admins</strong> open the control dashboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

