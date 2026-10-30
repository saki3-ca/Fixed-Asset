'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Check, Loader2, Lock, MapPin, Pencil, Plus, Search, User } from 'lucide-react';

export interface FieldLocation {
  id: string;
  building: string;
  floor: string;
  room: string;
  custodian: string | null;
  status: 'open' | 'closed' | 'signed_off';
}

// "Building 4 › 2nd Floor › Admin Office": only the parts that have been filled in
export const locationLabel = (l: Pick<FieldLocation, 'building' | 'floor' | 'room'>) =>
  [l.building, l.floor, l.room].filter((p) => p && p.trim()).join(' › ');

interface LocationPickerProps {
  currentId?: string | null;
  onSelect: (loc: FieldLocation) => void;
  /** Show a sign-off link on each row (Locations page) */
  showSignOff?: boolean;
  /** Start in edit mode for this location (used by "Edit details") */
  editId?: string | null;
  onEditDone?: () => void;
}

type FormState = { building: string; floor: string; room: string; custodian: string };
const EMPTY: FormState = { building: '', floor: '', room: '', custodian: '' };

export const LocationPicker: React.FC<LocationPickerProps> = ({ currentId, onSelect, showSignOff, editId, onEditDone }) => {
  const [locations, setLocations] = useState<FieldLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editing, setEditing] = useState<FieldLocation | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('location')
      .select('id, building, floor, room, custodian, status')
      .order('building')
      .order('floor')
      .order('room');
    setLocations((data || []) as FieldLocation[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = useCallback((loc: FieldLocation) => {
    setEditing(loc);
    setForm({ building: loc.building, floor: loc.floor, room: loc.room, custodian: loc.custodian || '' });
    setError(null);
    setMode('edit');
  }, []);

  // Opened straight into edit mode for the current location
  useEffect(() => {
    if (!editId || locations.length === 0) return;
    const loc = locations.find((l) => l.id === editId);
    if (loc) startEdit(loc);
  }, [editId, locations, startEdit]);

  const buildings = useMemo(() => Array.from(new Set(locations.map((l) => l.building))), [locations]);
  const floors = useMemo(
    () => Array.from(new Set(locations.filter((l) => l.building === form.building).map((l) => l.floor).filter(Boolean))),
    [locations, form.building]
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = locations.filter(
      (l) => !q || `${l.building} ${l.floor} ${l.room} ${l.custodian || ''}`.toLowerCase().includes(q)
    );
    const map = new Map<string, FieldLocation[]>();
    filtered.forEach((l) => map.set(l.building, [...(map.get(l.building) || []), l]));
    return Array.from(map.entries());
  }, [locations, query]);

  const startAdd = () => {
    // Keep the building the auditor is already in, so adding "Floor 2" is two taps
    const current = locations.find((l) => l.id === currentId);
    setForm({ ...EMPTY, building: current?.building || '' });
    setError(null);
    setMode('add');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.building.trim()) return setError('Enter the building or site name.');
    setSaving(true);
    const supabase = createClient();
    const { data, error: rpcErr } =
      mode === 'edit' && editing
        ? await supabase.rpc('update_location_details', {
            p_location: editing.id,
            p_floor: form.floor,
            p_room: form.room,
            p_custodian: form.custodian,
          })
        : await supabase.rpc('add_location', {
            p_building: form.building,
            p_floor: form.floor,
            p_room: form.room,
            p_custodian: form.custodian,
          });
    setSaving(false);
    if (rpcErr) return setError(rpcErr.message);
    await load();
    setMode('list');
    setEditing(null);
    onEditDone?.();
    if (data) onSelect(data as FieldLocation);
  };

  if (mode === 'add' || mode === 'edit') {
    return (
      <form onSubmit={save} className="space-y-4">
        <div>
          <h3 className="font-display text-xl font-bold text-slate-900">
            {mode === 'edit' ? 'Location details' : 'Add location'}
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            {mode === 'edit'
              ? 'Add what you know now. You can come back and complete it later.'
              : 'Start with the building. Floor, room and user can be added as you go.'}
          </p>
        </div>

        {error && <div className="auth-alert-error">{error}</div>}

        <div className="form-field">
          <label>Building / site *</label>
          <input
            className="form-input"
            list="loc-buildings"
            value={form.building}
            disabled={mode === 'edit'}
            onChange={(e) => setForm({ ...form, building: e.target.value })}
            placeholder="e.g. Building 4"
            autoFocus={mode === 'add'}
          />
          <datalist id="loc-buildings">
            {buildings.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="form-field">
            <label>Floor</label>
            <input
              className="form-input"
              list="loc-floors"
              value={form.floor}
              onChange={(e) => setForm({ ...form, floor: e.target.value })}
              placeholder="e.g. 2nd Floor"
              autoFocus={mode === 'edit'}
            />
            <datalist id="loc-floors">
              {floors.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <div className="form-field">
            <label>Room / area</label>
            <input
              className="form-input"
              value={form.room}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
              placeholder="e.g. Admin Office"
            />
          </div>
        </div>
        <div className="form-field">
          <label>User / custodian</label>
          <input
            className="form-input"
            value={form.custodian}
            onChange={(e) => setForm({ ...form, custodian: e.target.value })}
            placeholder="e.g. Mr X"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setMode('list');
              setEditing(null);
              onEditDone?.();
            }}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {mode === 'edit' ? 'Save details' : 'Add & use'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={startAdd} className="btn btn-primary w-full" style={{ minHeight: 52 }}>
        <Plus className="w-5 h-5" /> Add new location
      </button>

      {locations.length > 6 && (
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="form-input"
            style={{ paddingLeft: 42 }}
            placeholder="Search building, floor, room or user"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading locations…
        </div>
      ) : grouped.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-600">
          {locations.length === 0 ? 'No locations yet. Add the first one above.' : 'Nothing matches your search.'}
        </div>
      ) : (
        grouped.map(([building, rows]) => (
          <div key={building}>
            <div className="px-1 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{building}</div>
            <div className="bg-white rounded-2xl border border-slate-300/60 shadow-soft overflow-hidden">
              {rows.map((l, idx) => {
                const selected = l.id === currentId;
                const locked = l.status === 'signed_off';
                const detail = [l.floor, l.room].filter(Boolean).join(' › ');
                return (
                  <div
                    key={l.id}
                    className={`flex items-center gap-2 pr-2 ${idx > 0 ? 'border-t border-slate-200' : ''} ${selected ? 'bg-brand-50' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(l)}
                      className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left min-h-[60px]"
                    >
                      <span className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-brand-700 shrink-0">
                        {locked ? <Lock size={17} /> : <MapPin size={17} />}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm break-words ${selected ? 'font-bold text-brand-700' : 'font-semibold text-slate-900'}`}>
                          {detail || 'Building only'}
                        </span>
                        <span className="block text-[11px] text-slate-500 break-words">
                          {l.custodian ? (
                            <span className="inline-flex items-center gap-1">
                              <User size={11} /> {l.custodian}
                            </span>
                          ) : (
                            'No user added yet'
                          )}
                          {locked ? ' · signed off' : ''}
                        </span>
                      </span>
                    </button>
                    {selected && <Check size={18} className="text-brand-700 shrink-0" />}
                    {!locked && (
                      <button
                        type="button"
                        aria-label="Edit details"
                        onClick={() => startEdit(l)}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 shrink-0"
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                    {showSignOff && !locked && (
                      <Link
                        href={`/count/close?loc=${l.id}`}
                        className="text-xs font-semibold text-brand-700 px-2.5 h-9 rounded-full bg-brand-50 flex items-center shrink-0"
                      >
                        Sign off
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
