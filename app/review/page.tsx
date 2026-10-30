'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/navigation/TopBar';
import { Check, CornerUpLeft, Loader2, ChevronDown, ChevronUp, Save } from 'lucide-react';

const PAGE_SIZE = 25;
const RESULTS = [
  'Verified',
  'Verified - Condition Issue',
  'Verified - Tag Issue',
  'Qty Short',
  'Qty Excess',
  'Not Found',
  'Not Accessible',
];
const RESOLUTIONS = [
  'Add to FAR',
  'Expensed item (below threshold)',
  'Not client asset (third party/leased)',
  'Already in FAR under other tag',
  'Other - see remarks',
];

interface Rec {
  id: string;
  tag_no: string;
  found: string | null;
  result: string;
  condition: string;
  tag_status: string;
  physical_qty: number;
  remarks: string | null;
  serial_no: string | null;
  brand_model: string | null;
  department: string | null;
  custodian: string | null;
  count_date: string;
  review_status: 'pending' | 'approved' | 'sent_back';
  review_comment: string | null;
  client_explanation: string | null;
  asset: { description: string; asset_class: string; cost: number; far_qty: number } | null;
  location: { building: string; floor: string; room: string } | null;
  counter: { full_name: string } | null;
  photo: Array<{ file_path: string }>;
}

interface Fnf {
  id: string;
  tag_found: string | null;
  description: string;
  brand_model: string | null;
  qty: number;
  condition: string;
  remarks: string | null;
  client_explanation: string | null;
  resolution: string | null;
  photo_path: string | null;
  location: { building: string; room: string } | null;
}

interface Flag {
  id: string;
  record_id: string;
  reason: string | null;
  changed_at: string;
}

const badge = (r: string) =>
  r === 'Verified'
    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
    : r === 'Not Found'
    ? 'bg-red-50 text-red-800 border-red-200'
    : 'bg-amber-50 text-amber-800 border-amber-200';

export default function ReviewPage() {
  const [role, setRole] = useState('');
  const [tab, setTab] = useState<'records' | 'fnf' | 'flags'>('records');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Records
  const [recs, setRecs] = useState<Rec[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [fResult, setFResult] = useState('');
  const [fReview, setFReview] = useState('pending');
  const [fSearch, setFSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({});
  const [comment, setComment] = useState('');
  const [explain, setExplain] = useState('');
  const [busy, setBusy] = useState(false);

  // Found not in FAR + flags
  const [fnf, setFnf] = useState<Fnf[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [fnfEdits, setFnfEdits] = useState<Record<string, { explanation: string; resolution: string }>>({});

  const canAct = role === 'admin' || role === 'reviewer' || role === 'team_lead';

  const loadRecords = useCallback(async () => {
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

    let q = supabase
      .from('verification')
      .select(
        `id, tag_no, found, result, condition, tag_status, physical_qty, remarks, serial_no, brand_model, department, custodian,
         count_date, review_status, review_comment, client_explanation,
         asset:tag_no (description, asset_class, cost, far_qty),
         location:location_id (building, floor, room),
         counter:counter_id (full_name),
         photo (file_path)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (fResult) q = q.eq('result', fResult);
    if (fReview) q = q.eq('review_status', fReview);
    if (fSearch.trim()) q = q.ilike('tag_no', `%${fSearch.trim()}%`);

    const { data, count, error: qErr } = await q;
    if (qErr) setError(qErr.message);
    setRecs((data || []) as unknown as Rec[]);
    setTotal(count || 0);
    setLoading(false);
  }, [page, fResult, fReview, fSearch]);

  const loadOthers = useCallback(async () => {
    const supabase = createClient();
    const { data: f } = await supabase
      .from('found_not_in_far')
      .select('id, tag_found, description, brand_model, qty, condition, remarks, client_explanation, resolution, photo_path, location:location_id (building, room)')
      .order('created_at', { ascending: false });
    setFnf((f || []) as unknown as Fnf[]);
    const { data: fl } = await supabase
      .from('audit_log')
      .select('id, record_id, reason, changed_at')
      .eq('field', 'duplicate_tag_flag')
      .order('changed_at', { ascending: false });
    setFlags((fl || []) as Flag[]);
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    loadOthers();
  }, [loadOthers]);

  const toggle = async (r: Rec) => {
    if (open === r.id) {
      setOpen(null);
      return;
    }
    setOpen(r.id);
    setComment(r.review_comment || '');
    setExplain(r.client_explanation || '');
    if (!photoUrls[r.id] && r.photo?.length) {
      const supabase = createClient();
      const urls: string[] = [];
      for (const p of r.photo) {
        const { data } = await supabase.storage.from('evidence').createSignedUrl(p.file_path, 3600);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      setPhotoUrls((prev) => ({ ...prev, [r.id]: urls }));
    }
  };

  const review = async (r: Rec, status: 'approved' | 'sent_back') => {
    setError(null);
    if (status === 'sent_back' && !comment.trim()) {
      setError('Add a comment so the counter knows what to fix.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error: updErr } = await supabase
      .from('verification')
      .update({
        review_status: status,
        review_comment: comment.trim() || null,
        client_explanation: explain.trim() || null,
      })
      .eq('id', r.id);
    setBusy(false);
    if (updErr) return setError(updErr.message);
    setOpen(null);
    loadRecords();
  };

  const saveExplanation = async (r: Rec) => {
    setBusy(true);
    const supabase = createClient();
    const { error: updErr } = await supabase
      .from('verification')
      .update({ client_explanation: explain.trim() || null })
      .eq('id', r.id);
    setBusy(false);
    if (updErr) setError(updErr.message);
    else loadRecords();
  };

  const saveFnf = async (f: Fnf) => {
    const e = fnfEdits[f.id];
    if (!e) return;
    const supabase = createClient();
    const { error: updErr } = await supabase
      .from('found_not_in_far')
      .update({ client_explanation: e.explanation || null, resolution: e.resolution || null })
      .eq('id', f.id);
    if (updErr) setError(updErr.message);
    else loadOthers();
  };

  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="min-h-screen bg-cream pb-10">
      <TopBar />
      <main className="max-w-4xl mx-auto p-4 space-y-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-brand-700">Review</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Check records and photos, approve or send back, and note the client&apos;s explanation.
            {!canAct && ' (Read-only for your role.)'}
          </p>
        </div>

        <div className="flex gap-1 border-b border-slate-300 overflow-x-auto">
          {[
            ['records', `Records (${total})`],
            ['fnf', `Not in FAR (${fnf.length})`],
            ['flags', `Duplicate tags (${flags.length})`],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k as typeof tab)}
              className={`px-3.5 min-h-[44px] text-xs font-semibold whitespace-nowrap border-b-2 ${
                tab === k ? 'border-brand-700 text-brand-700' : 'border-transparent text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <div className="auth-alert-error">{error}</div>}

        {tab === 'records' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <select className="form-select" value={fReview} onChange={(e) => { setPage(0); setFReview(e.target.value); }}>
                <option value="">All review states</option>
                <option value="pending">Pending review</option>
                <option value="sent_back">Sent back</option>
                <option value="approved">Approved</option>
              </select>
              <select className="form-select" value={fResult} onChange={(e) => { setPage(0); setFResult(e.target.value); }}>
                <option value="">All results</option>
                {RESULTS.map((r) => <option key={r}>{r}</option>)}
              </select>
              <input
                className="form-input col-span-2 sm:col-span-1"
                placeholder="Search tag no."
                value={fSearch}
                onChange={(e) => { setPage(0); setFSearch(e.target.value); }}
              />
            </div>

            {loading ? (
              <div className="py-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : recs.length === 0 ? (
              <div className="bg-white border border-slate-300 rounded-xl p-6 text-center text-sm text-slate-600">
                Nothing matches these filters.
              </div>
            ) : (
              <div className="space-y-2">
                {recs.map((r) => (
                  <div key={r.id} className="bg-white border border-slate-300 rounded-xl shadow-sm">
                    <button onClick={() => toggle(r)} className="w-full text-left p-3.5 flex items-start justify-between gap-3 min-h-[64px]">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-900">{r.tag_no}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge(r.result)}`}>{r.result}</span>
                          {r.review_status !== 'pending' && (
                            <span className="text-[10px] font-bold uppercase text-slate-500">{r.review_status.replace('_', ' ')}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-800 break-words">{r.asset?.description}</div>
                        <div className="text-[11px] text-slate-500">
                          {r.location ? `${r.location.building} › ${r.location.room}` : 'No room'} · {r.counter?.full_name || 'Unknown'} · {r.count_date}
                        </div>
                      </div>
                      {open === r.id ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 mt-1" />}
                    </button>

                    {open === r.id && (
                      <div className="border-t border-slate-200 p-3.5 space-y-3 bg-cream-card rounded-b-xl">
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                          <div><dt className="text-slate-500">Class</dt><dd className="font-semibold break-words">{r.asset?.asset_class}</dd></div>
                          <div><dt className="text-slate-500">Cost</dt><dd className="font-semibold">Tk {Number(r.asset?.cost || 0).toLocaleString()}</dd></div>
                          <div><dt className="text-slate-500">Found</dt><dd className="font-semibold">{r.found}</dd></div>
                          <div><dt className="text-slate-500">Qty (FAR {r.asset?.far_qty})</dt><dd className="font-semibold">{r.physical_qty}</dd></div>
                          <div><dt className="text-slate-500">Condition</dt><dd className="font-semibold">{r.condition}</dd></div>
                          <div><dt className="text-slate-500">Tag</dt><dd className="font-semibold break-words">{r.tag_status}</dd></div>
                          {r.serial_no && <div><dt className="text-slate-500">Serial</dt><dd className="font-semibold break-words">{r.serial_no}</dd></div>}
                          {r.brand_model && <div><dt className="text-slate-500">Brand / model</dt><dd className="font-semibold break-words">{r.brand_model}</dd></div>}
                          {r.department && <div><dt className="text-slate-500">Department</dt><dd className="font-semibold break-words">{r.department}</dd></div>}
                          {r.custodian && <div><dt className="text-slate-500">Custodian</dt><dd className="font-semibold break-words">{r.custodian}</dd></div>}
                        </dl>
                        {r.remarks && <p className="text-xs text-slate-700"><strong>Counter remarks:</strong> {r.remarks}</p>}

                        {(photoUrls[r.id]?.length ?? 0) > 0 ? (
                          <div className="grid grid-cols-3 gap-2">
                            {photoUrls[r.id].map((u) => (
                              <a key={u} href={u} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt="Evidence" className="w-full aspect-square object-cover rounded-lg border border-slate-300" />
                              </a>
                            ))}
                          </div>
                        ) : r.photo?.length ? (
                          <p className="text-xs text-slate-500">Loading photos…</p>
                        ) : r.found === 'Yes' && (['Poor', 'Damaged', 'Idle', 'Not Working'].includes(r.condition) || r.tag_status !== 'Tag OK') ? (
                          <p className="text-xs text-red-700 font-semibold">No photo on file for an asset with a condition or tag issue.</p>
                        ) : null}

                        {canAct && (
                          <>
                            {(r.result === 'Not Found' || r.result === 'Qty Short' || r.result === 'Not Accessible') && (
                              <div className="form-field">
                                <label>Client explanation</label>
                                <textarea className="form-textarea" rows={2} value={explain} onChange={(e) => setExplain(e.target.value)} />
                                <button onClick={() => saveExplanation(r)} disabled={busy} className="btn btn-secondary self-start" style={{ minHeight: 44 }}>
                                  <Save className="w-4 h-4" /> Save explanation
                                </button>
                              </div>
                            )}
                            <div className="form-field">
                              <label>Comment (required to send back)</label>
                              <textarea className="form-textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button onClick={() => review(r, 'sent_back')} disabled={busy} className="btn btn-secondary" style={{ minHeight: 48 }}>
                                <CornerUpLeft className="w-4 h-4" /> Send back
                              </button>
                              <button onClick={() => review(r, 'approved')} disabled={busy} className="btn btn-primary" style={{ minHeight: 48 }}>
                                <Check className="w-4 h-4" /> Approve
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-slate-600">
              <button className="btn btn-secondary" style={{ minHeight: 44 }} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {page + 1} of {pages}</span>
              <button className="btn btn-secondary" style={{ minHeight: 44 }} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </>
        )}

        {tab === 'fnf' && (
          <div className="space-y-2">
            {fnf.length === 0 && <div className="bg-white border border-slate-300 rounded-xl p-6 text-center text-sm text-slate-600">No items logged.</div>}
            {fnf.map((f) => {
              const e = fnfEdits[f.id] || { explanation: f.client_explanation || '', resolution: f.resolution || '' };
              return (
                <div key={f.id} className="bg-white border border-slate-300 rounded-xl p-3.5 shadow-sm space-y-2">
                  <div className="text-sm font-bold text-slate-900 break-words">{f.description}</div>
                  <div className="text-[11px] text-slate-500">
                    {f.tag_found ? `Tag ${f.tag_found}` : 'No tag'} · qty {f.qty} · {f.condition}
                    {f.location ? ` · ${f.location.building} › ${f.location.room}` : ''}
                    {f.brand_model ? ` · ${f.brand_model}` : ''}
                  </div>
                  {f.remarks && <p className="text-xs text-slate-700">{f.remarks}</p>}
                  {canAct && (
                    <>
                      <div className="form-field">
                        <label>Client explanation</label>
                        <textarea className="form-textarea" rows={2} value={e.explanation} onChange={(ev) => setFnfEdits((p) => ({ ...p, [f.id]: { ...e, explanation: ev.target.value } }))} />
                      </div>
                      <div className="form-field">
                        <label>Resolution</label>
                        <select className="form-select" value={e.resolution} onChange={(ev) => setFnfEdits((p) => ({ ...p, [f.id]: { ...e, resolution: ev.target.value } }))}>
                          <option value="">Not decided</option>
                          {RESOLUTIONS.map((x) => <option key={x}>{x}</option>)}
                        </select>
                      </div>
                      <button onClick={() => saveFnf(f)} className="btn btn-primary" style={{ minHeight: 44 }}>
                        <Save className="w-4 h-4" /> Save
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'flags' && (
          <div className="space-y-2">
            {flags.length === 0 && <div className="bg-white border border-slate-300 rounded-xl p-6 text-center text-sm text-slate-600">No duplicate tags flagged.</div>}
            {flags.map((f) => (
              <div key={f.id} className="bg-white border border-amber-200 rounded-xl p-3.5 shadow-sm">
                <div className="font-mono text-xs font-bold">{f.record_id}</div>
                <p className="text-xs text-slate-700 mt-1">{f.reason}</p>
                <p className="text-[11px] text-slate-500 mt-1">{new Date(f.changed_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
