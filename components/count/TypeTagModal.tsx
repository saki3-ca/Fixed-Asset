'use client';

import React, { useState } from 'react';
import { X, Search, QrCode } from 'lucide-react';

interface TypeTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitTag: (tag: string) => void;
  onSwitchToScanner: () => void;
}

export const TypeTagModal: React.FC<TypeTagModalProps> = ({
  isOpen,
  onClose,
  onSubmitTag,
  onSwitchToScanner,
}) => {
  const [tagInput, setTagInput] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tagInput.trim();
    if (!cleaned) return;
    onSubmitTag(cleaned);
    setTagInput('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900">Enter Asset Tag Number</h3>
            <p className="text-xs text-slate-500">Usually an 8-digit number (e.g. 60000000)</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              autoFocus
              inputMode="numeric"
              placeholder="e.g. 60000000"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="w-full min-h-[56px] text-center font-mono text-xl font-bold tracking-widest bg-slate-50 border-2 border-slate-300 rounded-xl focus:bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 text-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={!tagInput.trim()}
            className="w-full min-h-[50px] bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white font-bold rounded-xl shadow-md text-sm transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            <Search className="w-4 h-4" />
            <span>Open Asset Card</span>
          </button>
        </form>

        <div className="pt-2 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSwitchToScanner();
            }}
            className="text-xs font-semibold text-brand-700 hover:text-brand-800 min-h-[44px] inline-flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4" />
            <span>Switch back to Camera Scanner</span>
          </button>
        </div>
      </div>
    </div>
  );
};

