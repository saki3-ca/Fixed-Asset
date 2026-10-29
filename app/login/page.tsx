'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Lock, LogIn, User as UserIcon } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get('error') === 'deactivated'
      ? 'Your account has been deactivated. Please contact the Lead Auditor.'
      : null
  );
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authErr) throw authErr;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, active')
        .eq('id', data.user.id)
        .single();

      if (!profile || !profile.active) {
        await supabase.auth.signOut();
        setError('Your account has been deactivated. Please contact the Lead Auditor.');
        return;
      }

      // Counters and team leads open the count screen; everyone else opens the dashboard
      router.push(profile.role === 'counter' || profile.role === 'team_lead' ? '/count' : '/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const message = (err as Error).message || '';
      if (message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please verify credentials.');
      } else if (message.includes('fetch failed') || message.includes('Failed to fetch')) {
        setError('Cannot reach the server. Please check your connection and try again.');
      } else {
        setError(message || 'Login failed. Please verify credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email.trim()) {
      setError('Enter your email above first, then tap "Forgot password?".');
      return;
    }
    setError(null);
    const supabase = createClient();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/set-password`,
    });
    if (resetErr) setError(resetErr.message);
    else setNotice('If that email has an account, a password reset link has been sent.');
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-card-header">
          <div
            className="brand-logo-badge"
            style={{ width: 56, height: 56, fontSize: 20, margin: '0 auto 12px' }}
          >
            AC
          </div>
          <h2 className="auth-card-title">ACNABIN</h2>
          <p className="auth-card-subtitle">Fixed Asset Count &amp; Verification Portal</p>
        </div>

        {notice && !error && <div className="auth-alert-success">{notice}</div>}
        {error && <div className="auth-alert-error">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-field">
            <label>Auditor Email</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                placeholder="e.g. auditor@acnabin.com"
                style={{ paddingLeft: '36px' }}
                autoFocus
              />
              <UserIcon
                size={16}
                style={{ position: 'absolute', left: 10, top: 11, color: 'var(--ink-soft)' }}
              />
            </div>
          </div>

          <div className="form-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>Password</label>
              <button
                type="button"
                onClick={handleForgot}
                className="btn-link"
                style={{ fontSize: '11px', padding: 0 }}
              >
                Forgot password?
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                placeholder="Enter password"
                required
                style={{ paddingLeft: '36px' }}
              />
              <Lock
                size={16}
                style={{ position: 'absolute', left: 10, top: 11, color: 'var(--ink-soft)' }}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '6px' }}>
            <LogIn size={16} /> {loading ? 'Authenticating…' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: '12.5px', color: 'var(--ink-soft)' }}>
          Accounts are created by invitation. Contact your Lead Auditor for access.
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
