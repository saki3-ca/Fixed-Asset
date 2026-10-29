'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowRightLeft, X, Loader2, CheckCircle2 } from 'lucide-react';

interface MovementFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  tagNo: string;
  fromLocationId?: string;
  fromLocationName?: string;
  toLocationId?: string;
  toLocationName?: string;
  onSuccess: () => void;
}

export const MovementFormModal: React.FC<MovementFormModalProps> = ({
  isOpen,
  onClose,
  tagNo,
  fromLocationId,
  fromLocationName = 'Previous Location',
  toLocationId,
  toLocationName = 'Current Room',
  onSuccess,
}) => {
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [qty, setQty] = useState('1');
  const [status, setStatus] = useState<'Received' | 'In Transit' | 'Returned'>('Received');
  const [gatePassNo, setGatePassNo] = useState('');
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!toLocationId) {
      setErrorMsg('Select a room before logging a movement.');
      return;
    }
    if (receiveDate && issueDate && receiveDate < issueDate) {
      setErrorMsg('The receive date cannot be before the issue date.');
      return;
    }
    setSaving(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('movement').insert({
        tag_no: tagNo,
        from_location_id: fromLocationId || null,
        to_location_id: toLocationId || null,
        issue_date: issueDate || null,
        receive_date: receiveDate || null,
        qty: parseFloat(qty) || 1,
        status,
        gate_pass_no: gatePassNo.trim() || null,
        authorized_by: authorizedBy.trim() || null,
        remarks: remarks.trim() || null,
        created_by: user?.id || null,
      });

      if (error) throw error;
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Failed to save asset movement record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl p-5 pb-6 shadow-2xl border border-slate-300 space-y-4 max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-50 text-brand-700 rounded-lg">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 leading-tight">Log Asset Movement</h3>
              <p className="text-xs text-slate-500 font-mono">Tag No: {tagNo}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* From / To summary pills */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Moved From</span>
              <span className="font-semibold text-slate-800 block truncate">{fromLocationName}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Moved To</span>
              <span className="font-semibold text-brand-800 block truncate">{toLocationName}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Date</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Receive Date</label>
              <input
                type="date"
                value={receiveDate}
                onChange={(e) => setReceiveDate(e.target.value)}
                className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Movement Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'Received' | 'In Transit' | 'Returned')}
                className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
              >
                <option value="Received">Received</option>
                <option value="In Transit">In Transit</option>
                <option value="Returned">Returned</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Gate Pass No.</label>
            <input
              type="text"
              placeholder="e.g. GP-2026-081"
              value={gatePassNo}
              onChange={(e) => setGatePassNo(e.target.value)}
              className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Authorised By</label>
            <input
              type="text"
              placeholder="e.g. Factory Manager"
              value={authorizedBy}
              onChange={(e) => setAuthorizedBy(e.target.value)}
              className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks</label>
            <input
              type="text"
              placeholder="Reason for movement..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[50px] bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white font-bold rounded-xl shadow-md text-xs flex items-center justify-center space-x-2 transition-all disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Recording Movement...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Save to Movement Register</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

