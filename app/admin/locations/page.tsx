'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/navigation/TopBar';
import { UserProfile } from '@/types/database';
import * as XLSX from 'xlsx';
import {
  Building2,
  Plus,
  UploadCloud,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UserCheck,
  FileSpreadsheet,
  Download,
  MapPin,
  Lock,
  DoorOpen
} from 'lucide-react';

interface LocationRecord {
  id: string;
  building: string;
  floor: string;
  room: string;
  assigned_counter?: string | null;
  status: 'open' | 'closed' | 'signed_off';
  client_rep_name?: string | null;
  signed_off_at?: string | null;
  created_at: string;
}

export default function AdminLocationsPage() {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [counters, setCounters] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Single location form
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [room, setRoom] = useState('');
  const [assignedCounter, setAssignedCounter] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // CSV Bulk state
  const [csvLocations, setCsvLocations] = useState<Array<{ building: string; floor: string; room: string; assigned_counter?: string | null }>>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Load locations and counters
  const loadData = async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      // Load counters / team leads
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['counter', 'manager'])
        .eq('active', true)
        .order('full_name');

      setCounters(profilesData || []);

      // Load locations
      const res = await fetch('/api/admin/locations');
      const locData = await res.json();
      if (!res.ok) throw new Error(locData.error || 'Failed to fetch locations');
      setLocations(locData.locations || []);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error loading location data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Add single location
  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!building || !floor || !room) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/admin/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building: building.trim(),
          floor: floor.trim(),
          room: room.trim(),
          assigned_counter: assignedCounter || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save location');

      setSuccessMsg(`Added ${building} › ${floor} › ${room} successfully.`);
      setRoom('');
      await loadData();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Failed to add location.');
    } finally {
      setSubmitting(false);
    }
  };

  // CSV upload for locations
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setCsvFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

      const parsed: Array<{ building: string; floor: string; room: string; assigned_counter?: string | null }> = [];

      for (const row of rows) {
        const keys = Object.keys(row);
        let bldg = '';
        let flr = '';
        let rm = '';
        let counterEmail = '';

        for (const k of keys) {
          const lk = k.toLowerCase().trim();
          const val = String(row[k] || '').trim();
          if (lk.includes('building') || lk.includes('site')) bldg = val;
          else if (lk.includes('floor')) flr = val;
          else if (lk.includes('room') || lk.includes('area') || lk.includes('location')) rm = val;
          else if (lk.includes('counter') || lk.includes('email') || lk.includes('assigned')) counterEmail = val.toLowerCase();
        }

        if (bldg && flr && rm) {
          // Resolve counter email to counter id if found
          const matchedCounter = counters.find((c) => c.email?.toLowerCase() === counterEmail);
          parsed.push({
            building: bldg,
            floor: flr,
            room: rm,
            assigned_counter: matchedCounter?.id || null,
          });
        }
      }

      if (parsed.length === 0) {
        throw new Error('No valid location rows found. Expecting columns: Building, Floor, Room.');
      }

      setCsvLocations(parsed);
      setSuccessMsg(`Parsed ${parsed.length} locations from file. Ready to save.`);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error parsing locations CSV.');
      setCsvLocations([]);
    }
  };

  // Save bulk CSV locations
  const handleBulkSaveLocations = async () => {
    if (csvLocations.length === 0) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setBulkSubmitting(true);

    try {
      const res = await fetch('/api/admin/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: csvLocations }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save bulk locations');

      setSuccessMsg(`Successfully saved ${data.count} locations.`);
      setCsvLocations([]);
      setCsvFileName(null);
      await loadData();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Bulk location save failed.');
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Download template
  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Building,Floor,Room,Counter_Email\nHead Office,2nd Floor,Room 202,counter@acnabin.com\nHead Office,2nd Floor,Server Room,counter@acnabin.com\nHead Office,3rd Floor,Accounts Dept,counter@acnabin.com\nFactory Plant,Ground Floor,Main Production,counter@acnabin.com\nFactory Plant,1st Floor,Packaging Area,counter@acnabin.com\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ACNABIN_FA_Count_Locations_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLocations = locations.filter((loc) => {
    const q = searchQuery.toLowerCase();
    const counterObj = counters.find((c) => c.id === loc.assigned_counter);
    const counterName = counterObj?.full_name?.toLowerCase() || '';
    return (
      loc.building.toLowerCase().includes(q) ||
      loc.floor.toLowerCase().includes(q) ||
      loc.room.toLowerCase().includes(q) ||
      counterName.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16">
      {/* Top Header */}
      <TopBar />

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Alerts */}
        {errorMsg && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-medium">{successMsg}</div>
          </div>
        )}

        {/* Action Grid: Single Add + CSV Bulk */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add Single Room Form */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
              <Plus className="w-5 h-5 text-brand-700" />
              <span>Add Single Room / Location</span>
            </div>
            <p className="text-xs text-slate-500">
              Create a specific room and assign it to an auditor for physical verification.
            </p>

            <form onSubmit={handleAddLocation} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Building / Site
                  </label>
                  <input
                    type="text"
                    required
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    placeholder="e.g. Head Office"
                    className="w-full min-h-[48px] px-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Floor
                  </label>
                  <input
                    type="text"
                    required
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="e.g. 2nd Floor"
                    className="w-full min-h-[48px] px-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Room / Section Name
                </label>
                <input
                  type="text"
                  required
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="e.g. Room 202, Server Room, Packaging Area"
                  className="w-full min-h-[48px] px-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Auditor (Counter)
                </label>
                <select
                  value={assignedCounter}
                  onChange={(e) => setAssignedCounter(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">Unassigned</option>
                  {counters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.role})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] px-4 py-2.5 bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white font-bold rounded-xl shadow-sm text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Adding Location...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Save Location</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Bulk CSV Upload */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                  <UploadCloud className="w-5 h-5 text-brand-700" />
                  <span>Bulk Import Locations</span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="text-xs font-semibold text-brand-700 hover:text-brand-800 flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV Template</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Upload a spreadsheet with: <strong>Building, Floor, Room, Counter_Email</strong>.
              </p>

              {/* Upload Input */}
              <div className="relative border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-2xl p-5 text-center transition-colors bg-slate-50/50 mt-3">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleCsvUpload}
                  disabled={bulkSubmitting}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex flex-col items-center justify-center space-y-1.5 pointer-events-none">
                  <FileSpreadsheet className="w-6 h-6 text-brand-700" />
                  <div className="text-xs font-semibold text-slate-800">
                    {csvFileName ? csvFileName : 'Click or drop locations file here'}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {csvLocations.length > 0 ? `${csvLocations.length} locations ready` : 'Supports CSV & Excel'}
                  </p>
                </div>
              </div>

              {/* Preview table */}
              {csvLocations.length > 0 && (
                <div className="mt-3 overflow-x-auto max-h-40 border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 sticky top-0">
                      <tr>
                        <th className="p-2">Building</th>
                        <th className="p-2">Floor</th>
                        <th className="p-2">Room</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {csvLocations.map((loc, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2 text-slate-900">{loc.building}</td>
                          <td className="p-2 text-slate-600">{loc.floor}</td>
                          <td className="p-2 text-slate-800 font-medium">{loc.room}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleBulkSaveLocations}
              disabled={bulkSubmitting || csvLocations.length === 0}
              className="w-full min-h-[48px] px-4 py-2.5 bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white font-bold rounded-xl shadow-sm text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {bulkSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Locations...</span>
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4" />
                  <span>Save {csvLocations.length} Locations</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Locations List Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-brand-700" />
                Configured Engagement Locations ({locations.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Each room is locked and evidenced upon client sign-off at the end of counting.
              </p>
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                placeholder="Search building, floor, room, auditor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-[40px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading locations...</span>
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No locations configured yet. Add a room or import CSV above.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3.5 font-semibold">Building</th>
                    <th className="p-3.5 font-semibold">Floor</th>
                    <th className="p-3.5 font-semibold">Room / Location</th>
                    <th className="p-3.5 font-semibold">Assigned Auditor</th>
                    <th className="p-3.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLocations.map((loc) => {
                    const assignedUser = counters.find((c) => c.id === loc.assigned_counter);
                    return (
                      <tr key={loc.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5 font-bold text-slate-900 flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{loc.building}</span>
                        </td>
                        <td className="p-3.5 text-slate-600">
                          {loc.floor}
                        </td>
                        <td className="p-3.5 font-semibold text-brand-900">
                          {loc.room}
                        </td>
                        <td className="p-3.5">
                          {assignedUser ? (
                            <span className="inline-flex items-center gap-1 text-slate-800 font-medium bg-slate-100 px-2 py-0.5 rounded-lg text-[11px]">
                              <UserCheck className="w-3 h-3 text-brand-600" />
                              {assignedUser.full_name}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Unassigned</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {loc.status === 'signed_off' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-200">
                              <Lock className="w-3 h-3" /> Signed Off
                            </span>
                          ) : loc.status === 'closed' ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200">
                              <Lock className="w-3 h-3" /> Closed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-[10px] font-bold border border-blue-200">
                              <DoorOpen className="w-3 h-3" /> Open
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

