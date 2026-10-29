'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/navigation/TopBar';
import { 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  FileSpreadsheet, 
  Users, 
  TrendingUp, 
  ShieldCheck,
  ClipboardCheck,
  UploadCloud,
  FileCheck2
} from 'lucide-react';

export default function DashboardPage() {
  const [profile, setProfile] = useState<{ full_name: string; role: string }>({
    full_name: 'Lead Auditor',
    role: 'reviewer',
  });

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .single();
        if (data) {
          setProfile(data);
        }
      }
    }
    loadUser();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TopBar 
        currentRoom="Headquarters / Control Center"
        userName={profile.full_name}
        userRole={profile.role}
        isOnline={true}
        pendingSyncCount={0}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Engagement Header */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              <span>ENGAGEMENT: REMARKS HB LIMITED</span>
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                Active Verification
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Audit Review &amp; Executive Dashboard
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              SAP FAR Extract (14 Jan 2026) · Cut-off: 30 June 2025 · 6,485 Total Unique Assets
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/users"
              className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm transition-colors"
            >
              <Users className="w-4 h-4 mr-1.5 text-brand-700" />
              Manage Users
            </Link>
            <Link
              href="/admin/locations"
              className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm transition-colors"
            >
              <Building2 className="w-4 h-4 mr-1.5 text-brand-700" />
              Manage Locations
            </Link>
            <Link
              href="/admin/import"
              className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold bg-brand-700 hover:bg-brand-800 text-white shadow-sm transition-colors"
            >
              <UploadCloud className="w-4 h-4 mr-1.5" />
              Import FAR Excel
            </Link>
            <span className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              {profile.role.toUpperCase()}
            </span>
          </div>
        </div>

        {/* High-Level Audit Metric Cards (Includes Cost & NBV for Reviewers/Admins) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>PHYSICALLY VERIFIABLE</span>
              <ClipboardCheck className="w-4 h-4 text-brand-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900">6,013</span>
              <span className="text-xs text-slate-500 font-medium">92.7% of FAR</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">IT, Plant &amp; Mach., Vehicles, Furniture</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>TOTAL AUDIT VALUE (COST)</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900">Tk 344.7 cr</span>
              <span className="text-xs text-emerald-600 font-medium">Full Value</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Confidential · Hidden from Counters</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>DOCUMENT / AUC / CLEARING</span>
              <FileCheck2 className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900">323</span>
              <span className="text-xs text-slate-500 font-medium">Title/Progress</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Land, CWIP, Asset Clearing Accounts</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
              <span>ZERO-COST ASSETS</span>
              <AlertTriangle className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-slate-900">149</span>
              <span className="text-xs text-slate-500 font-medium">Excluded</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Reference list (Cost = 0 at cut-off)</p>
          </div>
        </div>

        {/* Review & Operations Quick Access */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-brand-700 font-bold text-sm mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Verification Review Queue</span>
              </div>
              <p className="text-xs text-slate-600">
                Filter asset verifications by condition, tag issue, quantity variance, or missing tags. Approve or send back.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">0 pending review</span>
              <span className="text-xs font-semibold text-brand-700">Open Queue →</span>
            </div>
          </div>

          <Link 
            href="/admin/locations"
            className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-brand-400 transition-colors"
          >
            <div>
              <div className="flex items-center space-x-2 text-brand-700 font-bold text-sm mb-1">
                <Building2 className="w-4 h-4" />
                <span>Location Sign-off &amp; Teams</span>
              </div>
              <p className="text-xs text-slate-600">
                Assign buildings, floors and rooms to field counters. Review and lock closed locations with client signatures.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">All locations open</span>
              <span className="text-xs font-semibold text-brand-700">Manage Rooms →</span>
            </div>
          </Link>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 text-brand-700 font-bold text-sm mb-1">
                <FileSpreadsheet className="w-4 h-4" />
                <span>One-Click Audit Workbooks</span>
              </div>
              <p className="text-xs text-slate-600">
                Export final Count &amp; Verification Sheet (with live Excel formulas) and client Asset Movement Register.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Excel Templates Ready</span>
              <span className="text-xs font-semibold text-brand-700">Export Center →</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

