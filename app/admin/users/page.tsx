'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { TopBar } from '@/components/navigation/TopBar';
import { UserProfile, UserRole } from '@/types/database';
import * as XLSX from 'xlsx';
import { 
  Users, 
  UserPlus, 
  UploadCloud, 
  ArrowLeft, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  UserCheck, 
  UserX,
  FileSpreadsheet,
  Download
} from 'lucide-react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Single user form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('counter');
  const [submitting, setSubmitting] = useState(false);

  // CSV Bulk state
  const [csvUsers, setCsvUsers] = useState<Array<{ name: string; email: string; role: UserRole }>>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Load users from Supabase
  const loadUsers = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Handle single user invite
  const handleInviteSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite.');

      setSuccessMsg(`Invitation sent successfully to ${email} as ${role}.`);
      setName('');
      setEmail('');
      setRole('counter');
      await loadUsers();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Failed to invite user.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle CSV file upload
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

      const parsed: Array<{ name: string; email: string; role: UserRole }> = [];

      for (const row of rows) {
        // Map common header variations
        const rowKeys = Object.keys(row);
        let rowEmail = '';
        let rowName = '';
        let rowRole: UserRole = 'counter';

        for (const k of rowKeys) {
          const lk = k.toLowerCase().trim();
          const val = String(row[k] || '').trim();
          if (lk.includes('email') || lk.includes('mail')) rowEmail = val;
          else if (lk.includes('name') || lk.includes('full name')) rowName = val;
          else if (lk.includes('role')) {
            const r = val.toLowerCase();
            if (['admin', 'counter', 'manager'].includes(r)) {
              rowRole = r as UserRole;
            }
          }
        }

        if (rowEmail && rowEmail.includes('@')) {
          parsed.push({
            name: rowName || rowEmail.split('@')[0],
            email: rowEmail.toLowerCase(),
            role: rowRole,
          });
        }
      }

      if (parsed.length === 0) {
        throw new Error('No valid user rows with emails found in the CSV.');
      }

      setCsvUsers(parsed);
      setSuccessMsg(`Parsed ${parsed.length} users from CSV. Ready to send invites.`);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error parsing CSV file.');
      setCsvUsers([]);
    }
  };

  // Submit bulk CSV invites
  const handleBulkInvite = async () => {
    if (csvUsers.length === 0) return;

    setErrorMsg(null);
    setSuccessMsg(null);
    setBulkSubmitting(true);

    try {
      const res = await fetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: csvUsers }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process invitations.');

      setSuccessMsg(`Successfully processed ${data.successful} of ${data.processed} users.`);
      setCsvUsers([]);
      setCsvFileName(null);
      await loadUsers();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Bulk invite failed.');
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Deactivate or reactivate user (Rule: Never hard delete!)
  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    const action = currentActive ? 'deactivate' : 'reactivate';
    if (!confirm(`Are you sure you want to ${action} this auditor? User accounts are never deleted to preserve audit trails.`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/users/toggle-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, active: !currentActive }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user status.');

      setSuccessMsg(data.message);
      await loadUsers();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Failed to change user status.');
    }
  };

  // Download template CSV
  const handleDownloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Full Name,Email,Role\nRafi Ahmed,rafi@acnabin.com,counter\nFarhan Kabir,farhan@acnabin.com,counter\nAudit Manager,manager@acnabin.com,manager\n";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "ACNABIN_FA_Count_Users_Template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'manager':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'counter':
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

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

        {/* Action Grid: Single Invite + CSV Upload */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form: Add Single User */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
              <UserPlus className="w-5 h-5 text-brand-700" />
              <span>Add Single Auditor</span>
            </div>
            <p className="text-xs text-slate-500">
              Sends an official Supabase invitation email. The user sets their password on first login.
            </p>

            <form onSubmit={handleInviteSingle} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rafi Ahmed"
                  className="w-full min-h-[48px] px-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="auditor@acnabin.com"
                  className="w-full min-h-[48px] px-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Audit Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full min-h-[48px] px-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
                >
                  <option value="counter">User / Counter (Phone: Scan &amp; verify; Cost hidden)</option>

                  <option value="manager">Manager (Supervise, assign rooms, review &amp; approve, cost visible)</option>
                  <option value="admin">Admin (PC: Full control, import FAR, add users)</option>
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
                    <span>Sending Invite Email...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Send Invite Email</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Form: CSV Bulk Upload */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                  <UploadCloud className="w-5 h-5 text-brand-700" />
                  <span>Bulk Add via CSV / Excel</span>
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
                Upload a spreadsheet with columns: <strong>Full Name, Email, Role</strong>.
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
                    {csvFileName ? csvFileName : 'Click or drop users CSV file here'}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {csvUsers.length > 0 ? `${csvUsers.length} users ready to invite` : 'Supports CSV and Excel'}
                  </p>
                </div>
              </div>

              {/* CSV Preview table if loaded */}
              {csvUsers.length > 0 && (
                <div className="mt-3 overflow-x-auto max-h-40 border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 sticky top-0">
                      <tr>
                        <th className="p-2">Name</th>
                        <th className="p-2">Email</th>
                        <th className="p-2">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {csvUsers.map((u, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2 font-medium text-slate-900">{u.name}</td>
                          <td className="p-2 text-slate-600">{u.email}</td>
                          <td className="p-2 text-slate-500">{u.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleBulkInvite}
              disabled={bulkSubmitting || csvUsers.length === 0}
              className="w-full min-h-[48px] px-4 py-2.5 bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white font-bold rounded-xl shadow-sm text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {bulkSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Bulk Invites...</span>
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  <span>Send Invites to {csvUsers.length} Users</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* User Directory Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-700" />
                Active Engagement Users ({users.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Audit integrity: Users are never deleted from the database. Deactivated accounts cannot sign in.
              </p>
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                placeholder="Search name, email, role..."
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
                <span>Loading team profiles...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No users found. Add an auditor using the form above.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3.5 font-semibold">Auditor Name</th>
                    <th className="p-3.5 font-semibold">Email</th>
                    <th className="p-3.5 font-semibold">Role</th>
                    <th className="p-3.5 font-semibold">Status</th>
                    <th className="p-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.active ? 'bg-slate-50/50 opacity-60' : ''}`}>
                      <td className="p-3.5 font-bold text-slate-900">
                        {u.full_name}
                      </td>
                      <td className="p-3.5 text-slate-600 font-mono text-[11px]">
                        {u.email || '—'}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getRoleBadge(u.role)}`}>
                          {u.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                            <UserCheck className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 font-semibold text-[11px]">
                            <UserX className="w-3.5 h-3.5" /> Deactivated
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(u.id, u.active)}
                          className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            u.active
                              ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 active:bg-rose-200'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200'
                          }`}
                        >
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

