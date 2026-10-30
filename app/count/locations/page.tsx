'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/navigation/TopBar';
import { LocationPicker, type FieldLocation } from '@/components/count/LocationPicker';

// All locations in one place: pick one to count in, add a new one, fill in details, or sign one off.
export default function LocationsPage() {
  const router = useRouter();
  const current = typeof window !== 'undefined' ? localStorage.getItem('fa_count_active_room_id') : null;

  const choose = (loc: FieldLocation) => {
    if (loc.status !== 'open') {
      router.push(`/count/close?loc=${loc.id}`);
      return;
    }
    localStorage.setItem('fa_count_active_room_id', loc.id);
    router.push('/count');
  };

  return (
    <div className="min-h-screen bg-cream">
      <TopBar />
      <main className="max-w-lg mx-auto p-4 space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-brand-700">Locations</h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Tap a location to count in it. Add the building first; floor, room and user can follow.
          </p>
        </div>
        <LocationPicker currentId={current} onSelect={choose} showSignOff />
      </main>
    </div>
  );
}
