'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/navigation/TopBar';
import { Loader2, Save } from 'lucide-react';

interface Eng {
  id: string;
  client_name: string;
  financial_year: string;
  far_cutoff_date: string;
  count_start_date: string | null;
  count_end_date: string | null;
  status: string;
}

export default function EngagementPage() {
  const [eng, setEng] = useState<Eng | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('engagement').select('*').order('created_at').limit(1).maybeSingle();
      setEng(
        (data as Eng) || {
          id: '',
          client_name: '',
          financial_year: '',
          far_cutoff_date: '',
          count_start_date: null,
          count_end_date: null,
          status: 'active',
        }
      );
      setLoading(false);
    })();
  }, []);

  const set = (patch: Partial<Eng>) => setEng((e) => (e ? { ...e, ...patch } : e));
  const locked = eng?.status === 'locked' || eng?.status === 'closed';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eng) return;
    setMsg(null);
    if (!eng.client_name.trim() || !eng.financial_year.trim() || !eng.far_cutoff_date) {
      return setMsg({ ok: false, text: 'Client, financial year and FAR cut-off date are required.' });
    }
    if (eng.count_start_date && eng.count_end_date && eng.count_end_date < eng.count_start_date) {
      return setMsg({ ok: false, text: 'The count end date cannot be before the start date.' });
    }
    setSaving(true);
    const supabase = createClient();
    const row = {
      client_name: eng.client_name.trim(),
      financial_year: eng.financial_year.trim(),
      far_cutoff_date: eng.far_cutoff_date,
      count_start_date: eng.count_start_date || null,
      count_end_date: eng.count_end_date || null,
    };
    const { data, error } = eng.id
      ? await supabase.from('engagement').update(row).eq('id', eng.id).select().single()
      : await supabase.from('engagement').insert({ ...row, status: 'active' }).select().single();
    setSaving(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setEng(data as Eng);
    setMsg({ ok: true, text: 'Engagement saved.' });
  };

  return (
    <div className="min-h-screen bg-cream pb-10">
      <TopBar />
      <main className="max-w-lg mx-auto p-4 space-y-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-brand-700">Engagement</h1>
          <p className="text-xs text-slate-600 mt-0.5">Client, financial year, FAR cut-off and count period.</p>
        </div>

        {loading || !eng ? (
          <div className="py-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <form onSubmit={save} className="bg-white border border-slate-300 rounded-xl p-4 space-y-4 shadow-sm">
            {msg && <div className={msg.ok ? 'auth-alert-success' : 'auth-alert-error'}>{msg.text}</div>}
            {locked && <div className="auth-alert-error">This engagement is {eng.status}. It can no longer be edited.</div>}

            <div className="form-field">
              <label>Client name</label>
              <input className="form-input" disabled={locked} value={eng.client_name} onChange={(e) => set({ client_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-field">
                <label>Financial year</label>
                <input className="form-input" disabled={locked} value={eng.financial_year} onChange={(e) => set({ financial_year: e.target.value })} placeholder="FY25" />
              </div>
              <div className="form-field">
                <label>FAR cut-off date</label>
                <input type="date" className="form-input" disabled={locked} value={eng.far_cutoff_date} onChange={(e) => set({ far_cutoff_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="form-field">
                <label>Count start</label>
                <input type="date" className="form-input" disabled={locked} value={eng.count_start_date || ''} onChange={(e) => set({ count_start_date: e.target.value })} />
              </div>
              <div className="form-field">
                <label>Count end</label>
                <input type="date" className="form-input" disabled={locked} value={eng.count_end_date || ''} onChange={(e) => set({ count_end_date: e.target.value })} />
              </div>
            </div>

            <button type="submit" disabled={saving || locked} className="btn btn-primary w-full" style={{ minHeight: 48 }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save engagement
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
