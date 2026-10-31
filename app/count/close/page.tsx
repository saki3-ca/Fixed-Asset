'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useSearchParams } from 'next/navigation';
import { TopBar } from '@/components/navigation/TopBar';
import { SignaturePad } from '@/components/count/SignaturePad';
import { CheckCircle2, Loader2, Lock, Unlock, ArrowLeft } from 'lucide-react';

interface RoomRow {
  id: string;
  building: string;
  floor: string;
  room: string;
  status: 'open' | 'closed' | 'signed_off';
  assigned_counter: string | null;
  areas_not_accessed: string | null;
  unaccessed_reason: string | null;
  client_rep_name: string | null;
  client_rep_designation: string | null;
  signed_off_at: string | null;
}

function CloseRoom() {
  const params = useSearchParams();
  const wanted = params.get('loc');
  const [role, setRole] = useState('counter');
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [roomId, setRoomId] = useState<string>('');
  const [results, setResults] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [areas, setAreas] = useState('');
  const [reason, setReason] = useState('');
  const [repName, setRepName] = useState('');
  const [repDesignation, setRepDesignation] = useState('');
  const [signature, setSignature] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const room = rooms.find((r) => r.id === roomId);
  const canReopen = role === 'admin' || role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const myRole = profile?.role || 'counter';
    setRole(myRole);

    const { data: locs } = await supabase
      .from('location')
      .select(
        'id, building, floor, room, status, assigned_counter, areas_not_accessed, unaccessed_reason, client_rep_name, client_rep_designation, signed_off_at'
      )
      .order('building')
      .order('floor')
      .order('room');

    const mine = (locs || []) as RoomRow[];
    setRooms(mine);

    const saved = wanted || localStorage.getItem('fa_count_active_room_id') || '';
    setRoomId((prev) => prev || (mine.find((r) => r.id === saved)?.id ?? mine[0]?.id ?? ''));
    setLoading(false);
  }, [wanted]);

  useEffect(() => {
    load();
  }, [load]);

  // Result breakdown for the selected room (RLS shows counters their own records, leads everything)
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('verification').select('result').eq('location_id', roomId);
      const counts: Record<string, number> = {};
      (data || []).forEach((v) => {
        counts[v.result] = (counts[v.result] || 0) + 1;
      });
      setResults(counts);
    })();
  }, [roomId]);

  const total = Object.values(results).reduce((a, b) => a + b, 0);

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!room) return;
    if (!repName.trim()) return setError('Enter the client representative’s name.');
    if (!signature) return setError('The client representative must sign on the screen.');
    if (areas.trim() && !reason.trim()) return setError('Give a reason for the areas not accessed.');
    if (total === 0 && !window.confirm('No assets were verified in this room. Close it anyway?')) return;

    setSaving(true);
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc('close_location', {
      p_location: room.id,
      p_areas: areas,
      p_reason: reason,
      p_rep_name: repName,
      p_rep_designation: repDesignation,
      p_signature: signature,
    });
    setSaving(false);
    if (rpcErr) return setError(rpcErr.message);
    setDone(true);
    load();
  };

  const handleReopen = async () => {
    if (!room) return;
    const why = window.prompt('Reason for reopening this room (required):');
    if (!why || !why.trim()) return;
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc('reopen_location', { p_location: room.id, p_reason: why });
    if (rpcErr) return setError(rpcErr.message);
    setDone(false);
    load();
  };

  return (
    <div className="min-h-screen bg-cream pb-10">
      <TopBar currentRoom={room ? [room.building, room.floor, room.room].filter(Boolean).join(' › ') : undefined} />

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <Link href="/count/locations" className="inline-flex items-center gap-1.5 min-h-[44px] text-xs font-semibold text-brand-700">
          <ArrowLeft className="w-4 h-4" /> Back to locations
        </Link>

        <div>
          <h1 className="font-display text-3xl font-bold text-brand-700">Sign off location</h1>
          <p className="text-xs text-slate-600 mt-0.5">Review what was verified, note anything not accessed, then get the client&apos;s signature.</p>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : rooms.length === 0 ? (
          <div className="bg-white border border-slate-300 rounded-xl p-5 text-sm text-slate-600">
            No rooms are assigned to you.
          </div>
        ) : (
          <>
            <div className="form-field">
              <label>Room</label>
              <select className="form-select" value={roomId} onChange={(e) => { setRoomId(e.target.value); setDone(false); setError(null); }}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {[r.building, r.floor, r.room].filter(Boolean).join(' › ')}{r.status === 'signed_off' ? ' (signed off)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* What was verified here */}
            <section className="bg-white border border-slate-300 rounded-xl p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">Verified in this room</h2>
              <div className="mt-1 text-3xl font-extrabold text-slate-900">{total}</div>
              {total > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(results).map(([k, n]) => (
                    <span
                      key={k}
                      className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${
                        k === 'Verified'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : k === 'Pending'
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {k}: {n}
                    </span>
                  ))}
                </div>
              )}
              {role === 'counter' && <p className="text-[11px] text-slate-500 mt-2">Counts show your own records.</p>}
            </section>

            {room?.status === 'signed_off' ? (
              <section className="bg-white border border-slate-300 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                  <Lock className="w-4 h-4" /> Signed off
                  {room.signed_off_at && (
                    <span className="text-xs font-normal text-slate-500">
                      {new Date(room.signed_off_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <dl className="text-xs text-slate-700 space-y-1">
                  <div><dt className="inline font-semibold">Client representative: </dt><dd className="inline">{room.client_rep_name}{room.client_rep_designation ? `, ${room.client_rep_designation}` : ''}</dd></div>
                  {room.areas_not_accessed && (
                    <div><dt className="inline font-semibold">Not accessed: </dt><dd className="inline">{room.areas_not_accessed} ({room.unaccessed_reason})</dd></div>
                  )}
                </dl>
                {done && <div className="auth-alert-success">Room closed. Counting in this room is now locked.</div>}
                {error && <div className="auth-alert-error">{error}</div>}
                {canReopen && (
                  <button onClick={handleReopen} className="btn btn-secondary" style={{ minHeight: 44 }}>
                    <Unlock className="w-4 h-4" /> Reopen room
                  </button>
                )}
                <Link href="/count" className="btn btn-primary" style={{ minHeight: 44 }}>
                  Back to counting
                </Link>
              </section>
            ) : (
              <form onSubmit={handleClose} className="bg-white border border-slate-300 rounded-xl p-4 space-y-4">
                {error && <div className="auth-alert-error">{error}</div>}

                <div className="form-field">
                  <label>Areas not accessed (if any)</label>
                  <input className="form-input" value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="e.g. Store locked, key with Admin" />
                </div>
                {areas.trim() && (
                  <div className="form-field">
                    <label>Reason *</label>
                    <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it could not be accessed" />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="form-field">
                    <label>Client representative *</label>
                    <input className="form-input" value={repName} onChange={(e) => setRepName(e.target.value)} placeholder="Full name" />
                  </div>
                  <div className="form-field">
                    <label>Designation</label>
                    <input className="form-input" value={repDesignation} onChange={(e) => setRepDesignation(e.target.value)} placeholder="e.g. Admin Manager" />
                  </div>
                </div>

                <div className="form-field">
                  <label>Signature *</label>
                  <SignaturePad onChange={setSignature} />
                </div>

                <button type="submit" disabled={saving} className="btn btn-primary w-full" style={{ minHeight: 50 }}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {saving ? 'Closing…' : 'Sign off & lock room'}
                </button>
                <p className="text-[11px] text-slate-500 text-center">
                  Once signed off, counting in this room is locked until a Team Lead reopens it.
                </p>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function CloseRoomPage() {
  return (
    <Suspense fallback={null}>
      <CloseRoom />
    </Suspense>
  );
}
