'use client';

import React from 'react';
import { AlertTriangle, ArrowRightLeft, Copy, Pencil, X } from 'lucide-react';
import type { AssetCounterView } from '@/types/database';

export interface AlreadyVerifiedInfo {
  tag_no: string;
  description: string;
  roomName: string;
  counterName: string;
  countTime: string;
  verificationId: string;
  fromLocationId?: string;
  /** True when the existing record is in the room the counter is working in */
  sameRoom: boolean;
  asset: AssetCounterView;
  otherQty: number;
}

interface AlreadyVerifiedModalProps {
  isOpen: boolean;
  onClose: () => void;
  info: AlreadyVerifiedInfo | null;
  onActionMoved: () => void;
  onActionDuplicate: () => void;
  onActionUpdate: () => void;
}

export const AlreadyVerifiedModal: React.FC<AlreadyVerifiedModalProps> = ({
  isOpen,
  onClose,
  info,
  onActionMoved,
  onActionDuplicate,
  onActionUpdate,
}) => {
  if (!isOpen || !info) return null;

  return (
    <div className="modal-backdrop z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl p-5 pb-6 shadow-2xl border border-amber-200 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-100 rounded-lg text-amber-700 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-extrabold text-base text-slate-900 leading-tight">Already verified</h3>
            <p className="text-xs text-slate-600 font-mono mt-0.5">Tag {info.tag_no}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-slate-500 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 bg-amber-50 rounded-lg border border-amber-200 text-xs text-slate-800 space-y-1">
          <div className="font-semibold text-slate-900">{info.description}</div>
          <div>
            Verified in <strong>{info.roomName}</strong>
          </div>
          <div>
            by <strong>{info.counterName}</strong> · {info.countTime}
          </div>
        </div>

        {info.sameRoom ? (
          <>
            <p className="text-xs text-slate-700">
              You already verified this tag in this room. Do you want to correct that record?
            </p>
            <button
              onClick={onActionUpdate}
              className="w-full min-h-[52px] px-4 bg-brand-700 hover:bg-brand-800 text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2"
            >
              <Pencil className="w-4 h-4" />
              Update this record
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-700">
              Did the asset move to your room, or is it a duplicate tag on a different asset?
            </p>
            <div className="space-y-2.5">
              <button
                onClick={onActionMoved}
                className="w-full min-h-[52px] px-4 bg-brand-700 hover:bg-brand-800 text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2"
              >
                <ArrowRightLeft className="w-4 h-4" />
                Moved: log a movement
              </button>
              <button
                onClick={onActionDuplicate}
                className="w-full min-h-[52px] px-4 bg-white hover:bg-cream-card text-slate-800 border-2 border-slate-300 font-bold rounded-lg text-sm flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4 text-amber-600" />
                Duplicate tag: flag for review
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
