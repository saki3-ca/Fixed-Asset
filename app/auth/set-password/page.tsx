'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Lock, Save } from 'lucide-react';

// Landing page for invite and password-reset emails.
// The email link carries a one-time token; supabase-js turns it into a session, then the user sets a password.
export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'INITIAL_SESSION')) {
        setReady(true);
      }
    });

    // If the link was already used or has expired there will be no session after a moment
    const timer = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) setReady(true);
      else setExpired(true);
    }, 2500);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = user
        ? await supabase.from('profiles').select('role').eq('id', user.id).single()
        : { data: null };

      router.push(profile?.role === 'counter' ? '/count' : '/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError((err as Error).message || 'Could not set the password.');
      setSaving(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-card-header">
          <div className="brand-logo-badge" style={{ width: 56, height: 56, fontSize: 20, margin: '0 auto 12px' }}>
            AC
          </div>
          <h2 className="auth-card-title">Set your password</h2>
          <p className="auth-card-subtitle">Choose a password to finish activating your account.</p>
        </div>

        {error && <div className="auth-alert-error">{error}</div>}

        {expired && !ready ? (
          <div className="auth-alert-error">
            This link has expired or was already used. Ask your Lead Auditor to send a new invitation, or use
            &quot;Forgot password?&quot; on the sign-in page.
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-slate-600">Verifying your link…</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-field">
              <label>New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="form-input"
                  style={{ paddingLeft: '36px' }}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Lock size={16} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--ink-soft)' }} />
              </div>
            </div>
            <div className="form-field">
              <label>Confirm password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="form-input"
                  style={{ paddingLeft: '36px' }}
                  placeholder="Repeat the password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                <Lock size={16} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--ink-soft)' }} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: '6px' }}>
              <Save size={16} /> {saving ? 'Saving…' : 'Save password & continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
