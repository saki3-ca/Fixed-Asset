'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/navigation/TopBar';
import { TypeTagModal } from '@/components/count/TypeTagModal';
import { SearchDescriptionModal } from '@/components/count/SearchDescriptionModal';
import { AlreadyVerifiedModal, type AlreadyVerifiedInfo } from '@/components/count/AlreadyVerifiedModal';
import { MovementFormModal } from '@/components/count/MovementFormModal';
import { FoundNotInFARModal } from '@/components/count/FoundNotInFARModal';
import { VerificationCard } from '@/components/count/VerificationCard';
import { AssetCounterView } from '@/types/database';
import {
  Keyboard,
  Search,
  PlusCircle,
  Building2,
  MapPin,
  Loader2,
  Check,
  DoorOpen,
  Lock,
  Sparkles,
} from 'lucide-react';

interface Room {
  id: string;
  building: string;
  floor: string;
  room: string;
  status: 'open' | 'closed' | 'signed_off';
  verifiedCount: number;
}

interface TagRow {
  verification_id: string;
  location_id: string | null;
  building: string | null;
  floor: string | null;
  room: string | null;
  counter_name: string | null;
  verified_at: string;
  physical_qty: number;
  found: string | null;
}

export default function CounterPage() {
  const [userRole, setUserRole] = useState<string>('counter');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);

  const [isTypeTagOpen, setIsTypeTagOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFoundNotInFarOpen, setIsFoundNotInFarOpen] = useState(false);
  const [prefilledTagNotFound, setPrefilledTagNotFound] = useState('');

  const [alreadyVerified, setAlreadyVerified] = useState<AlreadyVerifiedInfo | null>(null);

  const [isMovementOpen, setIsMovementOpen] = useState(false);
  const [movementTagNo, setMovementTagNo] = useState('');
  const [movementFromRoomId, setMovementFromRoomId] = useState<string | undefined>(undefined);
  const [movementFromRoomName, setMovementFromRoomName] = useState<string | undefined>(undefined);

  // Active verification: the asset, plus qty already counted in other rooms (group assets)
  const [activeAsset, setActiveAsset] = useState<{ asset: AssetCounterView; otherQty: number } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const roomLocked = !!currentRoom && currentRoom.status !== 'open';

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const role = profile?.role || 'counter';
      setUserRole(role);

      const { data: locs, error: locErr } = await supabase
        .from('location')
        .select('id, building, floor, room, status, assigned_counter')
        .order('building')
        .order('floor')
        .order('room');
      if (locErr) throw locErr;

      // Counters only work in rooms assigned to them; team leads and admins can open any room
      const targetLocs =
        role === 'counter'
          ? (locs || []).filter((l) => l.assigned_counter === user.id)
          : locs || [];

      const { data: verifs } = await supabase
        .from('verification')
        .select('location_id')
        .eq('counter_id', user.id);

      const countMap: Record<string, number> = {};
      (verifs || []).forEach((v) => {
        if (v.location_id) countMap[v.location_id] = (countMap[v.location_id] || 0) + 1;
      });

      const formatted: Room[] = targetLocs.map((l) => ({
        id: l.id,
        building: l.building,
        floor: l.floor,
        room: l.room,
        status: l.status as Room['status'],
        verifiedCount: countMap[l.id] || 0,
      }));
      setRooms(formatted);

      const savedId = localStorage.getItem('fa_count_active_room_id');
      const saved = formatted.find((r) => r.id === savedId);
      const fallback = formatted.find((r) => r.status === 'open') || formatted[0] || null;
      setCurrentRoom((prev) => {
        const keep = prev && formatted.find((r) => r.id === prev.id);
        return keep || saved || fallback;
      });
      const chosen = formatted.find((r) => r.id === savedId) || fallback;
      if (chosen) localStorage.setItem('fa_count_active_room_id', chosen.id);
    } catch (err) {
      console.error('Error loading counter hub:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectRoom = (room: Room) => {
    setCurrentRoom(room);
    localStorage.setItem('fa_count_active_room_id', room.id);
    showToast(`Active room: ${room.building} › ${room.room}`);
  };

  const roomLabel = (r: { building: string | null; room: string | null }) =>
    `${r.building || ''} › ${r.room || ''}`;

  // Decide what happens for a tag: not in FAR / already verified / open the form
  const processTag = async (rawTag: string) => {
    const tag = rawTag.trim();
    if (!tag) return;
    if (!currentRoom) {
      showToast('Select a room first.');
      return;
    }
    if (roomLocked) {
      showToast('This room is signed off. Ask a Team Lead to reopen it.');
      return;
    }

    setLookupBusy(true);
    try {
      const supabase = createClient();

      const { data: asset, error: assetErr } = await supabase
        .from('asset_counter_view')
        .select('*')
        .eq('tag_no', tag)
        .maybeSingle();
      if (assetErr) throw assetErr;

      // Not in FAR: log it, never drop it
      if (!asset) {
        setPrefilledTagNotFound(tag);
        setIsFoundNotInFarOpen(true);
        return;
      }

      if (asset.method === 'Document') {
        alert(
          `${tag} is a Land / AUC / clearing item (${asset.asset_class}). These are checked against documents, not counted in a room.`
        );
        return;
      }

      // Counters cannot read other counters' rows, so this goes through a server function
      const { data: rows, error: rpcErr } = await supabase.rpc('lookup_tag_status', { p_tag: tag });
      if (rpcErr) throw rpcErr;
      const existing = (rows || []) as TagRow[];

      if (existing.length === 0) {
        setActiveAsset({ asset, otherQty: 0 });
        return;
      }

      const here = existing.find((r) => r.location_id === currentRoom.id);
      const elsewhere = existing.filter((r) => r.location_id !== currentRoom.id);

      // Group asset (qty > 1) counted in another room: this room adds its own quantity
      if (!here && asset.far_qty > 1) {
        const otherQty = elsewhere.filter((r) => r.found === 'Yes').reduce((n, r) => n + Number(r.physical_qty || 0), 0);
        setActiveAsset({ asset, otherQty });
        return;
      }

      const ref = here || existing[0];
      setAlreadyVerified({
        tag_no: tag,
        description: asset.description,
        roomName: roomLabel(ref),
        counterName: ref.counter_name || 'Another auditor',
        countTime: new Date(ref.verified_at).toLocaleString([], {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
        verificationId: ref.verification_id,
        fromLocationId: ref.location_id || undefined,
        sameRoom: !!here,
        asset,
        otherQty: elsewhere.filter((r) => r.found === 'Yes').reduce((n, r) => n + Number(r.physical_qty || 0), 0),
      });
    } catch (err: unknown) {
      console.error('Error evaluating tag:', err);
      alert('Error searching for tag: ' + ((err as Error).message || 'unknown error'));
    } finally {
      setLookupBusy(false);
    }
  };

  const handleMoved = () => {
    if (!alreadyVerified) return;
    setMovementTagNo(alreadyVerified.tag_no);
    setMovementFromRoomId(alreadyVerified.fromLocationId);
    setMovementFromRoomName(alreadyVerified.roomName);
    setAlreadyVerified(null);
    setIsMovementOpen(true);
  };

  const handleDuplicate = async () => {
    if (!alreadyVerified) return;
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('flag_duplicate_tag', {
        p_tag: alreadyVerified.tag_no,
        p_room: currentRoom ? `${currentRoom.building} › ${currentRoom.room}` : null,
        p_note: `Same tag scanned in ${currentRoom?.room || 'another room'} but already verified in ${alreadyVerified.roomName}`,
      });
      if (error) throw error;
      setAlreadyVerified(null);
      showToast('Flagged for the reviewer. Original record untouched.');
    } catch (err) {
      alert('Could not flag the duplicate: ' + ((err as Error).message || 'unknown error'));
    }
  };

  const handleUpdateHere = () => {
    if (!alreadyVerified) return;
    setActiveAsset({ asset: alreadyVerified.asset, otherQty: alreadyVerified.otherQty });
    setAlreadyVerified(null);
  };

  const handleSaved = () => {
    setActiveAsset(null);
    showToast('Saved. Ready for the next tag.');
    loadData(true);
    setTimeout(() => setIsTypeTagOpen(true), 250);
  };

  return (
    <div className="flex flex-col min-h-screen bg-cream pb-6">
      <TopBar currentRoom={currentRoom ? `${currentRoom.building} › ${currentRoom.room}` : 'Select a room'} />

      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-emerald-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 max-w-[90vw]">
          <Sparkles className="w-4 h-4 text-emerald-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
        {/* Active room */}
        <section className="bg-white rounded-xl p-4 border border-slate-300 shadow-sm">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            <span>Counting in</span>
            {roomLocked ? (
              <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" /> Signed off
              </span>
            ) : (
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">Open</span>
            )}
          </div>

          <h1 className="mt-1.5 text-base font-extrabold text-slate-900 flex items-start gap-1.5">
            <Building2 className="w-4 h-4 text-brand-700 mt-0.5 shrink-0" />
            <span className="break-words">
              {currentRoom ? `${currentRoom.building} › ${currentRoom.room}` : 'No room selected'}
            </span>
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Floor {currentRoom?.floor || '—'} · You verified{' '}
            <strong className="text-emerald-700">{currentRoom?.verifiedCount || 0}</strong> here
          </p>

          <Link
            href="/count/close"
            className="mt-3 w-full min-h-[44px] bg-cream-card hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 border border-slate-300"
          >
            <Lock className="w-3.5 h-3.5" />
            Close this room &amp; get client sign-off
          </Link>
        </section>

        {roomLocked && (
          <div className="auth-alert-error">
            This room is signed off, so counting is locked. A Team Lead can reopen it from the Locations page.
          </div>
        )}

        {/* Primary actions */}
        <section className="space-y-3">
          <button
            type="button"
            disabled={!currentRoom || roomLocked || lookupBusy}
            onClick={() => setIsTypeTagOpen(true)}
            className="w-full min-h-[64px] px-5 bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white rounded-xl shadow-md transition-all flex items-center gap-3.5 disabled:opacity-50"
          >
            <div className="p-2.5 bg-white/20 rounded-lg shrink-0">
              {lookupBusy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Keyboard className="w-6 h-6" />}
            </div>
            <div className="text-left">
              <div className="text-base font-extrabold leading-tight">Enter Tag Number</div>
              <div className="text-xs text-white/80 mt-0.5">Type the 8-digit tag on the asset</div>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!currentRoom || roomLocked}
              onClick={() => setIsSearchOpen(true)}
              className="flex flex-col items-center justify-center min-h-[72px] p-3 bg-white hover:bg-cream-card border border-slate-300 rounded-xl shadow-sm text-slate-800 disabled:opacity-50"
            >
              <Search className="w-5 h-5 text-brand-700 mb-1" />
              <span className="text-xs font-bold">Search by name</span>
              <span className="text-[10px] text-slate-500">Tag unreadable</span>
            </button>

            <button
              type="button"
              disabled={!currentRoom || roomLocked}
              onClick={() => {
                setPrefilledTagNotFound('');
                setIsFoundNotInFarOpen(true);
              }}
              className="flex flex-col items-center justify-center min-h-[72px] p-3 bg-white hover:bg-cream-card border border-slate-300 rounded-xl shadow-sm text-slate-800 disabled:opacity-50"
            >
              <PlusCircle className="w-5 h-5 text-amber-600 mb-1" />
              <span className="text-xs font-bold">Not in FAR</span>
              <span className="text-[10px] text-slate-500">Untagged asset</span>
            </button>
          </div>
        </section>

        {/* Rooms */}
        <section className="bg-white rounded-xl p-4 border border-slate-300 shadow-sm space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-brand-700" />
            {userRole === 'counter' ? 'My rooms' : 'All rooms'} ({rooms.length})
          </h2>

          {loading ? (
            <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              Loading rooms…
            </div>
          ) : rooms.length === 0 ? (
            <div className="py-5 text-center text-xs text-slate-500">
              No rooms are assigned to you yet. Ask a Team Lead or Admin to assign you a room.
            </div>
          ) : (
            <div className="space-y-1.5">
              {rooms.map((rm) => {
                const selected = currentRoom?.id === rm.id;
                return (
                  <button
                    key={rm.id}
                    type="button"
                    onClick={() => handleSelectRoom(rm)}
                    className={`w-full text-left min-h-[56px] px-3 py-2 rounded-lg flex items-center justify-between gap-2 border ${
                      selected ? 'bg-brand-50 border-brand-200' : 'bg-white border-slate-200 hover:bg-cream-card'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-md shrink-0 ${selected ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {rm.status === 'open' ? <DoorOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 break-words">
                          {rm.building} › {rm.room}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Floor {rm.floor}
                          {rm.status !== 'open' ? ' · signed off' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {rm.verifiedCount}
                      </span>
                      {selected && <Check className="w-4 h-4 text-brand-700" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <TypeTagModal
        isOpen={isTypeTagOpen}
        onClose={() => setIsTypeTagOpen(false)}
        onSubmitTag={(tag) => {
          setIsTypeTagOpen(false);
          processTag(tag);
        }}
      />

      <SearchDescriptionModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectTag={(tag) => {
          setIsSearchOpen(false);
          processTag(tag);
        }}
      />

      <AlreadyVerifiedModal
        isOpen={!!alreadyVerified}
        onClose={() => setAlreadyVerified(null)}
        info={alreadyVerified}
        onActionMoved={handleMoved}
        onActionDuplicate={handleDuplicate}
        onActionUpdate={handleUpdateHere}
      />

      <MovementFormModal
        isOpen={isMovementOpen}
        onClose={() => setIsMovementOpen(false)}
        tagNo={movementTagNo}
        fromLocationId={movementFromRoomId}
        fromLocationName={movementFromRoomName}
        toLocationId={currentRoom?.id}
        toLocationName={currentRoom ? `${currentRoom.building} › ${currentRoom.room}` : 'Current room'}
        onSuccess={() => {
          showToast('Movement logged.');
          loadData(true);
        }}
      />

      <FoundNotInFARModal
        isOpen={isFoundNotInFarOpen}
        onClose={() => setIsFoundNotInFarOpen(false)}
        tagFound={prefilledTagNotFound}
        locationId={currentRoom?.id}
        onSuccess={() => {
          showToast('Item recorded under Found Not in FAR.');
          loadData(true);
        }}
      />

      {activeAsset && (
        <VerificationCard
          asset={activeAsset.asset}
          otherQty={activeAsset.otherQty}
          currentRoomId={currentRoom?.id}
          currentRoomName={currentRoom ? `${currentRoom.building} › ${currentRoom.room}` : 'Current room'}
          onClose={() => setActiveAsset(null)}
          onSaveAndScanNext={handleSaved}
        />
      )}
    </div>
  );
}
