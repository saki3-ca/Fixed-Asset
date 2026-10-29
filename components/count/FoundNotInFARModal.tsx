'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { compressEvidencePhoto } from '@/lib/camera/compress';
import { PlusCircle, X, Camera, Loader2, CheckCircle2 } from 'lucide-react';

interface FoundNotInFARModalProps {
  isOpen: boolean;
  onClose: () => void;
  tagFound?: string;
  locationId?: string;
  onSuccess: () => void;
}

export const FoundNotInFARModal: React.FC<FoundNotInFARModalProps> = ({
  isOpen,
  onClose,
  tagFound = '',
  locationId,
  onSuccess,
}) => {
  const [tag, setTag] = useState(tagFound);
  const [description, setDescription] = useState('');
  const [brandModel, setBrandModel] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [probableClass, setProbableClass] = useState('IT Hardware and Equipment');
  const [qty, setQty] = useState('1');
  const [condition, setCondition] = useState('Good');
  const [inUse, setInUse] = useState(true);
  const [remarks, setRemarks] = useState('');

  // Photo state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressEvidencePhoto(file);
      setPhotoFile(compressed);
      setPhotoPreview(URL.createObjectURL(compressed));
    } catch (err) {
      console.warn('Photo processing warning:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      let photoPath: string | null = null;

      // Upload evidence photo if provided
      if (photoFile) {
        const timestamp = Date.now();
        const safeTag = tag.trim() || 'untagged';
        const storagePath = `found_not_in_far/${safeTag}_${timestamp}.jpg`;

        const { error: uploadErr } = await supabase.storage
          .from('evidence')
          .upload(storagePath, photoFile, { contentType: 'image/jpeg' });

        if (!uploadErr) {
          photoPath = storagePath;
        } else {
          console.warn('Photo upload warning:', uploadErr.message);
        }
      }

      // Insert into found_not_in_far
      const { error } = await supabase.from('found_not_in_far').insert({
        location_id: locationId || null,
        tag_found: tag.trim() || null,
        description: description.trim(),
        brand_model: brandModel.trim() || null,
        serial_no: serialNo.trim() || null,
        probable_class: probableClass,
        qty: parseFloat(qty) || 1,
        condition,
        in_use: inUse,
        photo_path: photoPath,
        client_explanation: remarks.trim() || null,
        logged_by: user?.id || null,
      });

      if (error) throw error;
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Failed to save unlisted asset.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-amber-50 text-amber-700 rounded-lg">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 leading-tight">Found Not in FAR</h3>
              <p className="text-xs text-slate-500">Record unlisted or untagged physical asset</p>
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
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tag Found on Asset (if any)
            </label>
            <input
              type="text"
              placeholder="Leave empty if completely untagged"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="w-full min-h-[46px] px-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Physical Description *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Dell UltraSharp 27 Monitor"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Brand / Model</label>
              <input
                type="text"
                placeholder="e.g. Dell U2723QE"
                value={brandModel}
                onChange={(e) => setBrandModel(e.target.value)}
                className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Serial Number</label>
              <input
                type="text"
                placeholder="e.g. CN-08X23..."
                value={serialNo}
                onChange={(e) => setSerialNo(e.target.value)}
                className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Probable Asset Class</label>
            <select
              value={probableClass}
              onChange={(e) => setProbableClass(e.target.value)}
              className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
            >
              <option value="IT Hardware and Equipment">IT Hardware and Equipment</option>
              <option value="Furniture and Fixture">Furniture and Fixture</option>
              <option value="Office Equipment">Office Equipment</option>
              <option value="Plant, Machinery, and Equipment">Plant &amp; Machinery</option>
              <option value="Factory Apparatus & Loose Tools">Loose Tools &amp; Apparatus</option>
              <option value="Car and Vehicle">Car and Vehicle</option>
              <option value="Lab Equipment">Lab Equipment</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Qty</label>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
              >
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Poor">Poor</option>
                <option value="Damaged">Damaged</option>
                <option value="Idle">Idle</option>
                <option value="Not Working">Not Working</option>
              </select>
            </div>
          </div>

          {/* Photo Capture */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Asset Photo</label>
            <div className="flex items-center space-x-3">
              <label className="flex items-center justify-center space-x-2 min-h-[48px] px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer border border-slate-300">
                <Camera className="w-4 h-4 text-brand-700" />
                <span>{photoFile ? 'Retake Photo' : 'Capture Photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoCapture}
                  className="hidden"
                />
              </label>
              {photoPreview && (
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-slate-300 shrink-0">
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks / Auditor Notes</label>
            <input
              type="text"
              placeholder="Where found, markings, why missing tag..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !description.trim()}
            className="w-full min-h-[50px] bg-amber-600 hover:bg-amber-700 active:scale-[0.99] text-white font-bold rounded-xl shadow-md text-xs flex items-center justify-center space-x-2 transition-all disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Unlisted Asset...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Save to Found Not in FAR</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

