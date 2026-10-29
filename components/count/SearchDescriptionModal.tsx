'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AssetCounterView } from '@/types/database';
import { X, Search, Loader2, ArrowRight } from 'lucide-react';

interface SearchDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTag: (tag: string) => void;
}

export const SearchDescriptionModal: React.FC<SearchDescriptionModalProps> = ({
  isOpen,
  onClose,
  onSelectTag,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssetCounterView[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setSearching(true);
    setHasSearched(true);

    try {
      const supabase = createClient();
      // Search from asset_counter_view (Strictly no cost or NBV)
      const { data, error } = await supabase
        .from('asset_counter_view')
        .select('*')
        .ilike('description', `%${q}%`)
        .limit(20);

      if (error) throw error;
      setResults(data || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-base text-slate-900">Search Asset by Description</h3>
            <p className="text-[11px] text-slate-500">Lookup by item name (e.g. laptop, camera, pump)</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            autoFocus
            placeholder="Type asset keyword..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-h-[48px] px-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="min-h-[48px] px-4 bg-brand-700 hover:bg-brand-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>Search</span>
          </button>
        </form>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100">
          {searching ? (
            <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              <span>Searching Fixed Asset Register...</span>
            </div>
          ) : results.length > 0 ? (
            results.map((asset) => (
              <button
                key={asset.tag_no}
                onClick={() => {
                  onSelectTag(asset.tag_no);
                  onClose();
                }}
                className="w-full text-left py-2.5 px-2 hover:bg-slate-50 active:bg-slate-100 rounded-lg flex items-center justify-between transition-colors min-h-[48px]"
              >
                <div className="pr-2">
                  <div className="font-mono text-xs font-bold text-brand-800">{asset.tag_no}</div>
                  <div className="text-xs text-slate-900 font-medium line-clamp-1">{asset.description}</div>
                  <div className="text-[10px] text-slate-500">{asset.asset_class}</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))
          ) : hasSearched ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No matching assets found for &quot;{query}&quot;.
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              Enter a keyword above to find asset tag numbers.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

