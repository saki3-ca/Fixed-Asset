'use client';

import React from 'react';
import { AlertTriangle, ArrowRightLeft, Copy, X } from 'lucide-react';

interface AlreadyVerifiedInfo {
  tag_no: string;
  roomName: string;
  counterName: string;
  countTime: string;
  description: string;
  verificationId: string;
}

interface AlreadyVerifiedModalProps {
  isOpen: boolean;
  onClose: () => void;
  info: AlreadyVerifiedInfo | null;
  onActionMoved: () => void;
  onActionDuplicate: () => void;
}

export const AlreadyVerifiedModal: React.FC<AlreadyVerifiedModalProps> = ({
  isOpen,
  onClose,
  info,
  onActionMoved,
  onActionDuplicate,
}) => {
  if (!isOpen || !info) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-amber-200 space-y-4">
        {/* Warning Icon & Header */}
        <div className="flex items-start space-x-3">
          <div className="p-2.5 bg-amber-100 rounded-xl text-amber-700 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-base text-slate-900 leading-tight">
              Already Verified Tag
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">Tag: {info.tag_no}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Verification Details */}
        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200/60 text-xs text-amber-950 space-y-1">
          <div className="font-semibold text-slate-900 line-clamp-1">{info.description}</div>
          <div>
            Verified in: <strong>{info.roomName}</strong>
          </div>
          <div>
            By: <strong>{info.counterName}</strong> · <span>{info.countTime}</span>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          Did this asset move to your current room, or did someone attach an identical duplicate tag?
        </p>

        {/* Two Big Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            onClick={onActionMoved}
            className="w-full min-h-[50px] px-4 py-3 bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white font-bold rounded-xl shadow-md text-xs flex items-center justify-center space-x-2 transition-all"
          >
            <ArrowRightLeft className="w-4 h-4 text-blue-200" />
            <span>Asset Moved (Log Movement)</span>
          </button>

          <button
            onClick={onActionDuplicate}
            className="w-full min-h-[50px] px-4 py-3 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border-2 border-slate-300 font-bold rounded-xl shadow-sm text-xs flex items-center justify-center space-x-2 transition-all"
          >
            <Copy className="w-4 h-4 text-amber-600" />
            <span>Duplicate Tag (Flag as Issue)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

