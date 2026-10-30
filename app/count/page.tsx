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
import { LocationPicker, locationLabel, type FieldLocation } from '@/components/count/LocationPicker';
import { AssetCounterView } from '@/types/database';
import { Keyboard, Search, PlusCircle, MapPin, Loader2, Lock, Sparkles, Pencil, Repeat, User, X, FileSignature } from 'lucide-react';

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

const STORAGE_KEY = 'fa_count_active_room_id';

export default function CounterPage() {
  const [loc, setLoc] = useState<FieldLocation | null>(null);
  const [verifiedHere, setVerifiedHere] = useState(0);
  const [loading, setLoading] = useState(true);

  // Location sheet: pick / add (and optionally edit the current one). `thenTag` reopens the tag box afterwards.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [thenTag, setThenTag] = useState(false);

  const [isTypeTagOpen, setIsTypeTagOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFoundNotInFarOpen, setIsFoundNotInFarOpen] = useState(false);
  const [prefilledTagNotFound, setPrefilledTagNotFound] = useState('');

  const [alreadyVerified, setAlreadyVerified] = useState<AlreadyVerifiedInfo | null>(null);

  const [isMovementOpen, setIsMovementOpen] = useState(false);
  const [movementTagNo, setMovementTagNo] = useState('');
  const [movementFromRoomId, setMovementFromRoomId] = useState<string | undefined>(undefined);
  const [movementFromRoomName, setMovementFromRoomName] = useState<string | undefined>(undefined);

  const [activeAsset, setActiveAsset] = useState<{ asset: AssetCounterView; otherQty: number } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const locked = !!loc && loc.status !== 'open';
  const label = loc ? locationLabel(loc) : '';

  // Load the location the auditor was last working in (if any); otherwise ask for one straight away
  const loadCurrent = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const supabase = createClient();
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (!savedId) {
        setLoc(null);
        setPickerOpen(true);
        return;
      }
      const { data } = await supabase
        .from('location')
        .select('id, building, floor, room, custodian, status')
        .eq('id', savedId)
        .maybeSingle();
      if (!data) {
        localStorage.removeItem(STORAGE_KEY);
        setLoc(null);
        setPickerOpen(true);
        return;
      }
      setLoc(data as FieldLocation);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { count } = await supabase
          .from('verification')
          .select('id', { count: 'exact', head: true })
          .eq('location_id', savedId)
          .eq('counter_id', user.id);
        setVerifiedHere(count || 0);
      }
    } catch (err) {
      console.error('Error loading location:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrent();
  }, [loadCurrent]);

  const openPicker = (opts: { edit?: boolean; thenTag?: boolean } = {}) => {
    setEditId(opts.edit && loc ? loc.id : null);
    setThenTag(!!opts.thenTag);
    setPickerOpen(true);
  };

  const closePicker = () => {
    setPickerOpen(false);
    setEditId(null);
    setThenTag(false);
  };

  const handleLocationChosen = (l: FieldLocation) => {
    localStorage.setItem(STORAGE_KEY, l.id);
    setLoc(l);
    setVerifiedHere(0);
    const reopen = thenTag;
    closePicker();
    loadCurrent(true);
    showToast(`Location: ${locationLabel(l)}`);
    if (reopen && l.status === 'open') setTimeout(() => setIsTypeTagOpen(true), 150);
  };

  const roomLabel = (r: { building: string | null; floor?: string | null; room: string | null }) =>
    [r.building, r.floor, r.room].filter((p) => p && p.trim()).join(' › ');

  // Decide what happens for a tag: not in FAR / already verified / open the form
  const processTag = async (rawTag: string) => {
    const tag = rawTag.trim();
    if (!tag) return;
    if (!loc) {
      openPicker({ thenTag: true });
      return;
    }
    if (locked) {
      showToast('This location is signed off. Ask a Team Lead to reopen it.');
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

      const here = existing.find((r) => r.location_id === loc.id);
      const elsewhere = existing.filter((r) => r.location_id !== loc.id);
      const qtyElsewhere = elsewhere
        .filter((r) => r.found === 'Yes')
        .reduce((n, r) => n + Number(r.physical_qty || 0), 0);

      // Group asset (qty > 1) counted in another location: this location adds its own quantity
      if (!here && asset.far_qty > 1) {
        setActiveAsset({ asset, otherQty: qtyElsewhere });
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
        otherQty: qtyElsewhere,
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
        p_room: label || null,
        p_note: `Same tag scanned in ${label || 'another location'} but already verified in ${alreadyVerified.roomName}`,
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

  // After saving, the tag box reopens with the location shown at the top, so it is checked before every asset
  const handleSaved = () => {
    setActiveAsset(null);
    showToast('Saved. Next asset.');
    loadCurrent(true);
    setTimeout(() => setIsTypeTagOpen(true), 250);
  };

  return (
    <div className="flex flex-col min-h-screen bg-cream">
      <TopBar />

      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-brand-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-float flex items-center gap-2 max-w-[90vw]">
          <Sparkles className="w-4 h-4 text-mint shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
        {/* Step 1: location */}
        <section className="bg-white rounded-3xl p-4 border border-slate-300/60 shadow-soft">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            <span>Step 1 · Location</span>
            {loc &&
              (locked ? (
                <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1 normal-case tracking-normal">
                  <Lock className="w-3 h-3" /> Signed off
                </span>
              ) : (
                <span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full normal-case tracking-normal">Open</span>
              ))}
          </div>

          {loading ? (
            <div className="py-6 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : loc ? (
            <>
              <h1 className="mt-2 font-display text-2xl font-bold text-slate-900 leading-tight break-words flex items-start gap-2">
                <MapPin className="w-5 h-5 text-brand-700 mt-1 shrink-0" />
                <span>{label}</span>
              </h1>
              <p className="text-xs text-slate-600 mt-1.5 flex items-center gap-1.5 flex-wrap">
                <User size={12} />
                {loc.custodian ? `User: ${loc.custodian}` : 'No user added yet'}
                <span className="text-slate-300">·</span>
                You verified <strong className="text-brand-700">{verifiedHere}</strong> here
              </p>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <button type="button" onClick={() => openPicker({ thenTag: false })} className="btn btn-secondary">
                  <Repeat size={16} /> Change
                </button>
                <button type="button" onClick={() => openPicker({ edit: true })} disabled={locked} className="btn btn-secondary">
                  <Pencil size={16} /> Add details
                </button>
              </div>
              {!loc.floor || !loc.room || !loc.custodian ? (
                <p className="text-[11px] text-slate-500 mt-2">
                  Tip: add the floor, room and user as you learn them. Counting is not blocked.
                </p>
              ) : null}
            </>
          ) : (
            <div className="py-3">
              <p className="text-sm text-slate-700 mt-2">Choose or add where you are counting before you start.</p>
              <button type="button" onClick={() => openPicker()} className="btn btn-primary w-full mt-3" style={{ minHeight: 52 }}>
                <MapPin size={18} /> Choose location
              </button>
            </div>
          )}
        </section>

        {locked && (
          <div className="auth-alert-error">
            This location is signed off, so counting is locked. A Team Lead can reopen it from the Locations tab.
          </div>
        )}

        {/* Step 2: count */}
        <section className="space-y-3">
          <div className="px-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Step 2 · Count</div>
          <button
            type="button"
            disabled={!loc || locked || lookupBusy}
            onClick={() => setIsTypeTagOpen(true)}
            className="w-full min-h-[68px] px-5 bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white rounded-full shadow-float transition-all flex items-center gap-3.5 disabled:opacity-50"
          >
            <div className="p-2.5 bg-white/15 rounded-full shrink-0">
              {lookupBusy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Keyboard className="w-6 h-6" />}
            </div>
            <div className="text-left">
              <div className="font-display text-xl font-bold leading-tight">Enter tag number</div>
              <div className="text-xs text-white/80 mt-0.5">Type the 8-digit tag on the asset</div>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!loc || locked}
              onClick={() => setIsSearchOpen(true)}
              className="flex flex-col items-center justify-center min-h-[76px] p-3 bg-white hover:bg-cream-card border border-slate-300/70 rounded-3xl shadow-soft text-slate-800 disabled:opacity-50"
            >
              <Search className="w-5 h-5 text-brand-700 mb-1" />
              <span className="text-xs font-bold">Search by name</span>
              <span className="text-[10px] text-slate-500">Tag unreadable</span>
            </button>

            <button
              type="button"
              disabled={!loc || locked}
              onClick={() => {
                setPrefilledTagNotFound('');
                setIsFoundNotInFarOpen(true);
              }}
              className="flex flex-col items-center justify-center min-h-[76px] p-3 bg-white hover:bg-cream-card border border-slate-300/70 rounded-3xl shadow-soft text-slate-800 disabled:opacity-50"
            >
              <PlusCircle className="w-5 h-5 text-amber-600 mb-1" />
              <span className="text-xs font-bold">Not in FAR</span>
              <span className="text-[10px] text-slate-500">Untagged asset</span>
            </button>
          </div>
        </section>

        {loc && !locked && (
          <Link
            href={`/count/close?loc=${loc.id}`}
            className="w-full min-h-[48px] bg-white hover:bg-cream-card text-slate-700 text-xs font-bold rounded-full flex items-center justify-center gap-1.5 border border-slate-300/70"
          >
            <FileSignature className="w-4 h-4" />
            Finished here? Get client sign-off
          </Link>
        )}
      </main>

      {/* Location sheet */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Close"
            onClick={closePicker}
            className="absolute inset-0 w-full h-full bg-slate-900/40 backdrop-blur-[2px] cursor-default"
            style={{ minHeight: 0 }}
          />
          <div className="absolute inset-x-0 bottom-0 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-6 sm:w-[440px] bg-cream rounded-t-3xl sm:rounded-3xl shadow-float border border-slate-300/70 max-h-[90vh] overflow-y-auto no-scrollbar p-4 pb-[calc(20px+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-2xl font-bold text-slate-900">Where are you counting?</h2>
              <button
                onClick={closePicker}
                aria-label="Close"
                className="w-10 h-10 rounded-full bg-white border border-slate-300/70 flex items-center justify-center"
                style={{ minHeight: 40 }}
              >
                <X size={18} />
              </button>
            </div>
            <LocationPicker currentId={loc?.id} onSelect={handleLocationChosen} editId={editId} onEditDone={() => setEditId(null)} />
          </div>
        </div>
      )}

      <TypeTagModal
        isOpen={isTypeTagOpen}
        onClose={() => setIsTypeTagOpen(false)}
        locationLabel={label || undefined}
        locationUser={loc?.custodian}
        onChangeLocation={() => {
          setIsTypeTagOpen(false);
          openPicker({ thenTag: true });
        }}
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
        toLocationId={loc?.id}
        toLocationName={label || 'Current location'}
        onSuccess={() => {
          showToast('Movement logged.');
          loadCurrent(true);
        }}
      />

      <FoundNotInFARModal
        isOpen={isFoundNotInFarOpen}
        onClose={() => setIsFoundNotInFarOpen(false)}
        tagFound={prefilledTagNotFound}
        locationId={loc?.id}
        onSuccess={() => {
          showToast('Item recorded under Found Not in FAR.');
          loadCurrent(true);
        }}
      />

      {activeAsset && (
        <VerificationCard
          asset={activeAsset.asset}
          otherQty={activeAsset.otherQty}
          defaultCustodian={loc?.custodian}
          currentRoomId={loc?.id}
          currentRoomName={label || 'Current location'}
          onClose={() => setActiveAsset(null)}
          onSaveAndScanNext={handleSaved}
        />
      )}
    </div>
  );
}
