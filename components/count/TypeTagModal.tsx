'use client';

import React, { useState } from 'react';
import { X, Search } from 'lucide-react';

interface TypeTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitTag: (tag: string) => void;
}

export const TypeTagModal: React.FC<TypeTagModalProps> = ({ isOpen, onClose, onSubmitTag }) => {
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
    <div className="modal-backdrop z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl p-5 pb-6 shadow-2xl border border-slate-300 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Enter tag number</h3>
            <p className="text-xs text-slate-600">The 8-digit number printed on the asset tag</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-slate-500 hover:text-slate-800 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="e.g. 60000000"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            className="w-full min-h-[56px] text-center font-mono text-2xl font-bold tracking-widest bg-white border-2 border-slate-300 rounded-lg text-slate-900"
          />
          <button
            type="submit"
            disabled={!tagInput.trim()}
            className="w-full min-h-[52px] bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white font-bold rounded-lg text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            Open asset card
          </button>
        </form>
      </div>
    </div>
  );
};
