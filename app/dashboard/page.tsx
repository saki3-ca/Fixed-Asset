'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/navigation/TopBar';
import { Loader2, Download, ClipboardCheck, Lock, RefreshCw, AlertTriangle } from 'lucide-react';

interface Stats {
  engagement: {
    id: string;
    client_name: string;
    financial_year: string;
    far_cutoff_date: string;
    status: string;
  } | null;
  totals: { assets: number; cost: number; verifiable: number; verifiable_cost: number; document: number };
  verified: { assets: number; cost: number };
  results: Record<string, number>;
  conditions: Record<string, number>;
  by_class: Array<{ asset_class: string; total: number; cost: number; verified: number; verified_cost: number }>;
  by_location: Array<{ id: string; building: string; floor: string; room: string; status: string; counter: string | null; verified: number }>;
  counters: Array<{ name: string; total: number; today: number }>;
  review: {
    pending: number;
    sent_back: number;
    approved: number;
    found_not_in_far: number;
    movements: number;
    duplicate_flags: number;
    doc_checked: number;
  };
  zero_cost: number;
}

const crore = (n: number) => `Tk ${(n / 1e7).toLocaleString(undefined, { maximumFractionDigits: 1 })} cr`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

function Bar({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'emerald' }) {
  return (
    <div className="h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`h-full rounded-full ${tone === 'emerald' ? 'bg-emerald-600' : 'bg-brand-700'}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white border border-slate-300 rounded-xl p-3.5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight break-words">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setRole(p?.role || '');
    }
    const { data, error: rpcErr } = await supabase.rpc('dashboard_stats');
    if (rpcErr) setError(rpcErr.message);
    else setStats(data as Stats);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCloseEngagement = async () => {
    if (!stats?.engagement) return;
    const pendingCount = Math.max(stats.totals.verifiable - stats.verified.assets, 0);
    const ok = window.confirm(
      `Close the engagement?\n\n${pendingCount.toLocaleString()} assets with no verification will be marked Not Found, and all data will be locked. This cannot be undone.`
    );
    if (!ok) return;
    setClosing(true);
    const supabase = createClient();
    const { data, error: rpcErr } = await supabase.rpc('close_engagement', { p_engagement: stats.engagement.id });
    setClosing(false);
    if (rpcErr) return setError(rpcErr.message);
    setNotice(`Engagement locked. ${data} pending assets were marked Not Found.`);
    load();
  };

  const canClose = (role === 'admin' || role === 'manager') && stats?.engagement?.status === 'active';
  const coverage = stats ? pct(stats.verified.assets, stats.totals.verifiable) : 0;
  const costCoverage = stats ? pct(stats.verified.cost, stats.totals.verifiable_cost) : 0;

  return (
    <div className="min-h-screen bg-cream pb-10">
      <TopBar currentRoom={stats?.engagement ? `${stats.engagement.client_name} · ${stats.engagement.financial_year}` : undefined} />

      <main className="max-w-7xl mx-auto p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-semibold text-brand-700 leading-tight">Count progress</h1>
            {stats?.engagement && (
              <p className="text-xs text-slate-600 mt-0.5">
                {stats.engagement.client_name} · {stats.engagement.financial_year} · FAR cut-off{' '}
                {new Date(stats.engagement.far_cutoff_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                <span
                  className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    stats.engagement.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {stats.engagement.status}
                </span>
              </p>
            )}
          </div>
          <button onClick={load} aria-label="Refresh" className="btn btn-secondary shrink-0" style={{ minHeight: 44 }}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {notice && <div className="auth-alert-success">{notice}</div>}
        {error && <div className="auth-alert-error">{error}</div>}

        {loading && !stats ? (
          <div className="py-16 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading figures…
          </div>
        ) : !stats ? null : stats.totals.assets === 0 ? (
          <div className="bg-white border border-slate-300 rounded-xl p-5 text-sm text-slate-700">
            No FAR has been imported yet.{' '}
            {role === 'admin' ? (
              <Link href="/admin/import" className="font-bold text-brand-700 underline">Import the FAR</Link>
            ) : (
              'Ask an admin to import it.'
            )}
          </div>
        ) : (
          <>
            {/* Headline coverage */}
            <section className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Coverage by count</div>
                  <div className="text-3xl font-extrabold text-slate-900">{coverage}%</div>
                </div>
                <div className="text-right text-xs text-slate-600">
                  {stats.verified.assets.toLocaleString()} of {stats.totals.verifiable.toLocaleString()} assets
                </div>
              </div>
              <Bar value={coverage} />
              <div className="flex items-end justify-between gap-3 pt-1">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Coverage by cost</div>
                  <div className="text-xl font-extrabold text-slate-900">{costCoverage}%</div>
                </div>
                <div className="text-right text-xs text-slate-600">
                  {crore(stats.verified.cost)} of {crore(stats.totals.verifiable_cost)}
                </div>
              </div>
              <Bar value={costCoverage} tone="emerald" />
            </section>

            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile label="Verifiable assets" value={stats.totals.verifiable.toLocaleString()} sub={crore(stats.totals.verifiable_cost)} />
              <Tile label="Land / AUC / clearing" value={stats.totals.document.toLocaleString()} sub={`${stats.review.doc_checked} document-checked`} />
              <Tile label="Zero-cost (excluded)" value={stats.zero_cost.toLocaleString()} sub="Reference list only" />
              <Tile label="Still pending" value={Math.max(stats.totals.verifiable - stats.verified.assets, 0).toLocaleString()} sub="No result yet" />
            </section>

            {/* Actions */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Link href="/review" className="bg-white border border-slate-300 rounded-xl p-3.5 shadow-sm min-h-[72px] flex flex-col justify-center hover:border-brand-400">
                <div className="flex items-center gap-1.5 text-brand-700 font-bold text-sm"><ClipboardCheck className="w-4 h-4" /> Review queue</div>
                <div className="text-xs text-slate-600 mt-0.5">{stats.review.pending} pending · {stats.review.sent_back} sent back</div>
              </Link>
              <a href="/api/export/count-sheet" className="bg-white border border-slate-300 rounded-xl p-3.5 shadow-sm min-h-[72px] flex flex-col justify-center hover:border-brand-400">
                <div className="flex items-center gap-1.5 text-brand-700 font-bold text-sm"><Download className="w-4 h-4" /> Count workbook</div>
                <div className="text-xs text-slate-600 mt-0.5">Excel, all records</div>
              </a>
              <a href="/api/export/exceptions" className="bg-white border border-slate-300 rounded-xl p-3.5 shadow-sm min-h-[72px] flex flex-col justify-center hover:border-brand-400">
                <div className="flex items-center gap-1.5 text-brand-700 font-bold text-sm"><AlertTriangle className="w-4 h-4" /> Exceptions</div>
                <div className="text-xs text-slate-600 mt-0.5">{stats.review.found_not_in_far} not in FAR · {stats.review.duplicate_flags} dup tags</div>
              </a>
              <a href="/api/export/movements" className="bg-white border border-slate-300 rounded-xl p-3.5 shadow-sm min-h-[72px] flex flex-col justify-center hover:border-brand-400">
                <div className="flex items-center gap-1.5 text-brand-700 font-bold text-sm"><Download className="w-4 h-4" /> Movements</div>
                <div className="text-xs text-slate-600 mt-0.5">{stats.review.movements} logged</div>
              </a>
            </section>

            {/* Results */}
            <section className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">Results</h2>
              {Object.keys(stats.results).length === 0 ? (
                <p className="text-xs text-slate-500 mt-2">No verifications recorded yet.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(stats.results)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, n]) => (
                      <span
                        key={k}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border ${
                          k === 'Verified'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : k === 'Pending'
                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                            : k === 'Not Found'
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {k}: {n.toLocaleString()}
                      </span>
                    ))}
                </div>
              )}
              {Object.keys(stats.conditions).length > 0 && (
                <p className="text-xs text-slate-600 mt-3">
                  Condition of found assets:{' '}
                  {Object.entries(stats.conditions).map(([k, n]) => `${k} ${n}`).join(' · ')}
                </p>
              )}
            </section>

            {/* By class */}
            <section className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 mb-2">Coverage by asset class</h2>
              <div className="divide-y divide-slate-200">
                {stats.by_class.map((c) => {
                  const p = pct(c.verified, c.total);
                  return (
                    <div key={c.asset_class} className="py-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-semibold text-slate-900 break-words">{c.asset_class}</span>
                        <span className="text-xs font-bold text-slate-900 shrink-0">{p}%</span>
                      </div>
                      <Bar value={p} />
                      <div className="text-[11px] text-slate-500">
                        {c.verified.toLocaleString()} / {c.total.toLocaleString()} assets · {crore(c.verified_cost)} of {crore(c.cost)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* By location */}
              <section className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 mb-2">Locations</h2>
                {stats.by_location.length === 0 ? (
                  <p className="text-xs text-slate-500">No locations created yet.</p>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {stats.by_location.map((l) => (
                      <div key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 break-words">{l.building} › {l.floor} › {l.room}</div>
                          <div className="text-[11px] text-slate-500">{l.counter || 'Unassigned'}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-slate-900">{l.verified}</span>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              l.status === 'signed_off' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {l.status === 'signed_off' && <Lock className="w-3 h-3" />}
                            {l.status === 'signed_off' ? 'Signed off' : 'Open'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Counter productivity */}
              <section className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 mb-2">Counter productivity</h2>
                {stats.counters.length === 0 ? (
                  <p className="text-xs text-slate-500">Nobody has counted yet.</p>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {stats.counters.map((c) => (
                      <div key={c.name} className="py-2.5 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-slate-900 break-words">{c.name}</span>
                        <span className="text-xs text-slate-600 shrink-0">
                          <strong className="text-slate-900">{c.total}</strong> total · {c.today} today
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {canClose && (
              <section className="bg-white border border-red-200 rounded-xl p-4 shadow-sm space-y-2">
                <h2 className="text-sm font-bold text-red-800">Close the engagement</h2>
                <p className="text-xs text-slate-600">
                  Assets with no result are marked Not Found with a reason, then all records are locked. Do this only after every room is signed off.
                </p>
                <button onClick={handleCloseEngagement} disabled={closing} className="btn btn-primary" style={{ minHeight: 48 }}>
                  {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {closing ? 'Closing…' : 'Close & lock engagement'}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
