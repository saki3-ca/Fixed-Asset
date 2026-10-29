'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/navigation/TopBar';
import { MobileNavBar } from '@/components/navigation/MobileNavBar';
import { BarcodeScannerModal } from '@/components/count/BarcodeScannerModal';
import { TypeTagModal } from '@/components/count/TypeTagModal';
import { SearchDescriptionModal } from '@/components/count/SearchDescriptionModal';
import { AlreadyVerifiedModal } from '@/components/count/AlreadyVerifiedModal';
import { MovementFormModal } from '@/components/count/MovementFormModal';
import { FoundNotInFARModal } from '@/components/count/FoundNotInFARModal';
import { VerificationCard } from '@/components/count/VerificationCard';
import { AssetCounterView } from '@/types/database';
import { 
  QrCode, 
  Search, 
  PlusCircle, 
  Building2, 
  MapPin, 
  Loader2, 
  Check, 
  DoorOpen,
  Lock,
  Sparkles
} from 'lucide-react';

interface AssignedRoom {
  id: string;
  building: string;
  floor: string;
  room: string;
  status: 'open' | 'closed' | 'signed_off';
  verifiedCount: number;
}

export default function CounterPage() {
  const [userProfile, setUserProfile] = useState<{ id: string; name: string; role: string } | null>(null);
  const [rooms, setRooms] = useState<AssignedRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<AssignedRoom | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal Visibility States
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isTypeTagOpen, setIsTypeTagOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFoundNotInFarOpen, setIsFoundNotInFarOpen] = useState(false);
  const [prefilledTagNotFound, setPrefilledTagNotFound] = useState('');

  // Already Verified Exception State
  const [isAlreadyVerifiedOpen, setIsAlreadyVerifiedOpen] = useState(false);
  const [alreadyVerifiedData, setAlreadyVerifiedData] = useState<{
    tag_no: string;
    roomName: string;
    counterName: string;
    countTime: string;
    description: string;
    verificationId: string;
    fromLocationId?: string;
  } | null>(null);

  // Movement Modal State
  const [isMovementOpen, setIsMovementOpen] = useState(false);
  const [movementTagNo, setMovementTagNo] = useState('');
  const [movementFromRoomId, setMovementFromRoomId] = useState<string | undefined>(undefined);
  const [movementFromRoomName, setMovementFromRoomName] = useState<string | undefined>(undefined);

  // Active Verification Card State
  const [activeAsset, setActiveAsset] = useState<AssetCounterView | null>(null);

  // Success Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 1. Initial Load: user profile, assigned locations, and counts
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', user.id)
        .single();

      const userName = profile?.full_name || user.email?.split('@')[0] || 'Auditor';
      const userRole = profile?.role || 'counter';
      setUserProfile({ id: user.id, name: userName, role: userRole });

      // Fetch rooms: assigned to this user, or all open rooms
      const { data: locs, error: locErr } = await supabase
        .from('location')
        .select('id, building, floor, room, status, assigned_counter')
        .order('building')
        .order('floor')
        .order('room');

      if (locErr) throw locErr;

      // Filter rooms assigned to this counter, or fallback to all rooms if none assigned
      const assignedLocs = (locs || []).filter(
        (l) => l.assigned_counter === user.id
      );
      const targetLocs = assignedLocs.length > 0 ? assignedLocs : locs || [];

      // Fetch verification counts per room for this counter
      const { data: verifs } = await supabase
        .from('verification')
        .select('location_id')
        .eq('counter_id', user.id);

      const countMap: Record<string, number> = {};
      (verifs || []).forEach((v) => {
        if (v.location_id) {
          countMap[v.location_id] = (countMap[v.location_id] || 0) + 1;
        }
      });

      const formattedRooms: AssignedRoom[] = targetLocs.map((l) => ({
        id: l.id,
        building: l.building,
        floor: l.floor,
        room: l.room,
        status: l.status as 'open' | 'closed' | 'signed_off',
        verifiedCount: countMap[l.id] || 0,
      }));

      setRooms(formattedRooms);

      // Check localStorage for active room
      const savedRoomId = localStorage.getItem('fa_count_active_room_id');
      const matchedSaved = formattedRooms.find((r) => r.id === savedRoomId);

      if (matchedSaved) {
        setCurrentRoom(matchedSaved);
      } else if (formattedRooms.length > 0) {
        setCurrentRoom(formattedRooms[0]);
        localStorage.setItem('fa_count_active_room_id', formattedRooms[0].id);
      }
    } catch (err) {
      console.error('Error loading counter hub:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set current room
  const handleSelectRoom = (room: AssignedRoom) => {
    setCurrentRoom(room);
    localStorage.setItem('fa_count_active_room_id', room.id);
    showToast(`Active room set: ${room.building} › ${room.room}`);
  };

  // 2. Evaluate Scanned Tag (Rules from Step 5 & Step 6)
  const processScannedTag = async (scannedTag: string) => {
    const tag = scannedTag.trim();
    if (!tag) return;

    try {
      const supabase = createClient();

      // Check Step 6 Exception: Is tag in FAR? (query asset_counter_view: NO cost/NBV)
      const { data: assetData, error: assetErr } = await supabase
        .from('asset_counter_view')
        .select('*')
        .eq('tag_no', tag)
        .maybeSingle();

      if (assetErr) throw assetErr;

      // Outcome A: Tag NOT in FAR -> Open Found Not in FAR form
      if (!assetData) {
        setPrefilledTagNotFound(tag);
        setIsFoundNotInFarOpen(true);
        return;
      }

      // Outcome B: Tag in FAR -> Check if ALREADY verified
      const { data: existingVerif } = await supabase
        .from('verification')
        .select(`
          id,
          tag_no,
          count_date,
          created_at,
          location_id,
          counter_id,
          location:location_id (building, floor, room),
          counter:counter_id (full_name)
        `)
        .eq('tag_no', tag)
        .maybeSingle();

      if (existingVerif) {
        // Tag already verified elsewhere
        type LocType = { building?: string; room?: string };
        type CounterType = { full_name?: string };
        const loc = existingVerif.location as unknown as LocType | null;
        const ctr = existingVerif.counter as unknown as CounterType | null;
        const locName = loc ? `${loc.building || ''} › ${loc.room || ''}` : 'Another Room';
        const counterName = ctr?.full_name || 'Another Auditor';
        const timeStr = existingVerif.created_at
          ? new Date(existingVerif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : existingVerif.count_date;

        setAlreadyVerifiedData({
          tag_no: tag,
          roomName: locName,
          counterName,
          countTime: timeStr,
          description: assetData.description,
          verificationId: existingVerif.id,
          fromLocationId: existingVerif.location_id || undefined,
        });

        setIsAlreadyVerifiedOpen(true);
        return;
      }

      // Outcome C: Tag in FAR and not yet verified -> Open Verification Card!
      setActiveAsset(assetData);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Error evaluating tag:', error);
      alert('Error searching for tag: ' + error.message);
    }
  };

  // Exception handling callbacks
  const handleOpenMovedMovement = () => {
    if (!alreadyVerifiedData) return;
    setMovementTagNo(alreadyVerifiedData.tag_no);
    setMovementFromRoomId(alreadyVerifiedData.fromLocationId);
    setMovementFromRoomName(alreadyVerifiedData.roomName);
    setIsAlreadyVerifiedOpen(false);
    setIsMovementOpen(true);
  };

  const handleDuplicateTagFlag = async () => {
    if (!alreadyVerifiedData) return;
    try {
      const supabase = createClient();
      await supabase
        .from('verification')
        .update({
          remarks: `Flagged as duplicate tag by counter in ${currentRoom?.room || 'Current Room'}`,
          tag_status: 'Tag Damaged/Unreadable',
        })
        .eq('id', alreadyVerifiedData.verificationId);

      setIsAlreadyVerifiedOpen(false);
      showToast('Flagged as duplicate tag exception.');
    } catch (err) {
      console.error('Duplicate flag error:', err);
    }
  };

  // Called when verification is saved -> returns directly to camera scanner
  const handleSaveAndScanNext = () => {
    setActiveAsset(null);
    showToast('Saved! Ready for next scan.');
    // Reopen camera scanner
    setTimeout(() => {
      setIsScannerOpen(true);
    }, 200);
    // Refresh room count
    loadData();
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-100 pb-20">
      {/* Top Bar with active session */}
      <TopBar
        currentRoom={
          currentRoom
            ? `${currentRoom.building} › ${currentRoom.room}`
            : 'Select a Room Below'
        }
        userName={userProfile?.name || 'Auditor'}
        userRole="Counter"
        isOnline={true}
        pendingSyncCount={0}
      />

      {/* Floating Success Toast */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-800 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center space-x-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      <main className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
        {/* Active Session Display */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1">
            <span>CURRENT COUNTING SESSION</span>
            <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
              Active Room
            </span>
          </div>

          <div className="flex items-center justify-between mt-1">
            <div>
              <h1 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-brand-700" />
                {currentRoom ? `${currentRoom.building} › ${currentRoom.room}` : 'No Room Selected'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Floor: {currentRoom?.floor || '—'} · Verified in room:{' '}
                <strong className="text-emerald-700 font-bold">{currentRoom?.verifiedCount || 0}</strong> assets
              </p>
            </div>

            <Link
              href="/locations/close"
              className="min-h-[40px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1 border border-slate-300 shrink-0"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Close Room</span>
            </Link>
          </div>
        </div>

        {/* Primary Action: Big SCAN Button (Min 58px) */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setIsScannerOpen(true)}
            className="w-full min-h-[64px] px-5 py-4 bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white rounded-2xl shadow-lg transition-all flex items-center justify-between group"
          >
            <div className="flex items-center space-x-3.5 text-left">
              <div className="p-2.5 bg-white/20 rounded-xl group-hover:scale-105 transition-transform">
                <QrCode className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="text-lg font-black tracking-wide leading-tight">
                  SCAN ASSET TAG
                </div>
                <div className="text-xs text-blue-200 mt-0.5">
                  Point rear camera at 8-digit barcode
                </div>
              </div>
            </div>
            <div className="text-xs font-bold bg-white/20 px-2.5 py-1.5 rounded-xl">
              Camera Ready
            </div>
          </button>

          {/* Quick Fallback Tap Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsTypeTagOpen(true)}
              className="flex flex-col items-center justify-center min-h-[60px] p-3 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 rounded-xl shadow-sm text-slate-800 transition-colors"
            >
              <Search className="w-5 h-5 text-brand-700 mb-1" />
              <span className="text-xs font-bold">Type Tag No.</span>
              <span className="text-[10px] text-slate-400">Manual lookup</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPrefilledTagNotFound('');
                setIsFoundNotInFarOpen(true);
              }}
              className="flex flex-col items-center justify-center min-h-[60px] p-3 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 rounded-xl shadow-sm text-slate-800 transition-colors"
            >
              <PlusCircle className="w-5 h-5 text-amber-600 mb-1" />
              <span className="text-xs font-bold">+ Not in FAR</span>
              <span className="text-[10px] text-slate-400">Untagged asset</span>
            </button>
          </div>
        </div>

        {/* My Locations (Assigned Rooms) List */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-brand-700" />
              My Assigned Rooms ({rooms.length})
            </h2>
            <span className="text-[11px] text-slate-500">Tap to switch active room</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              <span>Loading assigned rooms...</span>
            </div>
          ) : rooms.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No rooms assigned. Admin can configure rooms under /admin/locations.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rooms.map((rm) => {
                const isSelected = currentRoom?.id === rm.id;
                return (
                  <button
                    key={rm.id}
                    type="button"
                    onClick={() => handleSelectRoom(rm)}
                    className={`w-full text-left py-3 px-3 rounded-xl flex items-center justify-between transition-colors min-h-[50px] ${
                      isSelected
                        ? 'bg-blue-50/80 border border-brand-200'
                        : 'hover:bg-slate-50 active:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <div
                        className={`p-1.5 rounded-lg ${
                          isSelected ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <DoorOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-900 leading-tight">
                          {rm.building} › {rm.room}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Floor: {rm.floor}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {rm.verifiedCount} verified
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-brand-700 font-bold" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* 1. Camera Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(decoded) => {
          setIsScannerOpen(false);
          processScannedTag(decoded);
        }}
        onOpenTypeTag={() => {
          setIsScannerOpen(false);
          setIsTypeTagOpen(true);
        }}
        onOpenSearch={() => {
          setIsScannerOpen(false);
          setIsSearchOpen(true);
        }}
      />

      {/* 2. Type Tag Modal */}
      <TypeTagModal
        isOpen={isTypeTagOpen}
        onClose={() => setIsTypeTagOpen(false)}
        onSubmitTag={(tag) => {
          setIsTypeTagOpen(false);
          processScannedTag(tag);
        }}
        onSwitchToScanner={() => {
          setIsTypeTagOpen(false);
          setIsScannerOpen(true);
        }}
      />

      {/* 3. Search Description Modal */}
      <SearchDescriptionModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectTag={(tag) => {
          setIsSearchOpen(false);
          processScannedTag(tag);
        }}
      />

      {/* 4. Exception: Already Verified Warning Modal */}
      <AlreadyVerifiedModal
        isOpen={isAlreadyVerifiedOpen}
        onClose={() => setIsAlreadyVerifiedOpen(false)}
        info={alreadyVerifiedData}
        onActionMoved={handleOpenMovedMovement}
        onActionDuplicate={handleDuplicateTagFlag}
      />

      {/* 5. Movement Form Modal */}
      <MovementFormModal
        isOpen={isMovementOpen}
        onClose={() => setIsMovementOpen(false)}
        tagNo={movementTagNo}
        fromLocationId={movementFromRoomId}
        fromLocationName={movementFromRoomName}
        toLocationId={currentRoom?.id}
        toLocationName={currentRoom ? `${currentRoom.building} › ${currentRoom.room}` : 'Current Room'}
        onSuccess={() => {
          showToast('Movement logged successfully!');
          loadData();
        }}
      />

      {/* 6. Exception: Found Not in FAR Modal */}
      <FoundNotInFARModal
        isOpen={isFoundNotInFarOpen}
        onClose={() => setIsFoundNotInFarOpen(false)}
        tagFound={prefilledTagNotFound}
        locationId={currentRoom?.id}
        onSuccess={() => {
          showToast('Untagged item recorded successfully!');
          loadData();
        }}
      />

      {/* 7. Core Verification Card Form */}
      {activeAsset && (
        <VerificationCard
          asset={activeAsset}
          currentRoomId={currentRoom?.id}
          currentRoomName={currentRoom ? `${currentRoom.building} › ${currentRoom.room}` : 'Current Room'}
          onClose={() => setActiveAsset(null)}
          onSaveAndScanNext={handleSaveAndScanNext}
        />
      )}

      {/* Mobile Bottom Navigation */}
      <MobileNavBar />
    </div>
  );
}
