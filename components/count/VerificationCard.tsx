'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AssetCounterView, AssetCondition, TagStatus } from '@/types/database';
import { compressEvidencePhoto } from '@/lib/camera/compress';
import { computeSHA256 } from '@/lib/crypto/hash';
import { getCurrentGPSLocation } from '@/lib/geo/location';
import { 
  CheckCircle2, 
  Camera, 
  Trash2, 
  Loader2, 
  AlertCircle, 
  ShieldCheck, 
  X,
  ScanLine
} from 'lucide-react';

interface PhotoItem {
  file: File;
  previewUrl: string;
  hash: string;
}

interface VerificationCardProps {
  asset: AssetCounterView;
  currentRoomId?: string;
  currentRoomName?: string;
  onClose: () => void;
  onSaveAndScanNext: () => void;
}

export const VerificationCard: React.FC<VerificationCardProps> = ({
  asset,
  currentRoomId,
  currentRoomName = 'Current Room',
  onClose,
  onSaveAndScanNext,
}) => {
  // Form fields
  const [found, setFound] = useState<'Yes' | 'No' | 'Not Accessible'>('Yes');
  const [condition, setCondition] = useState<AssetCondition>('Good');
  const [tagStatus, setTagStatus] = useState<TagStatus>('Tag OK');
  const [reTagNumber, setReTagNumber] = useState('');
  const [inUse, setInUse] = useState<boolean>(true);
  const [physicalQty, setPhysicalQty] = useState<number>(asset.far_qty || 1);
  const [serialNo, setSerialNo] = useState('');
  const [brandModel, setBrandModel] = useState('');
  const [department, setDepartment] = useState('');
  const [custodian, setCustodian] = useState('');
  const [remarks, setRemarks] = useState('');

  // Photos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Minimum required photos rule
  const isConditionIssue = ['Poor', 'Damaged', 'Idle', 'Not Working'].includes(condition);
  const isTagIssue = tagStatus !== 'Tag OK';
  const requiredPhotos = found === 'Yes' ? (isConditionIssue || isTagIssue ? 2 : 1) : 0;

  const handleCapturePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressEvidencePhoto(file);
      const hash = await computeSHA256(compressed);
      const previewUrl = URL.createObjectURL(compressed);

      setPhotos((prev) => [...prev, { file: compressed, previewUrl, hash }]);
    } catch (err) {
      console.error('Photo capture error:', err);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setErrorMsg(null);

    // Enforce photo rule
    if (photos.length < requiredPhotos) {
      setErrorMsg(
        `Audit Rule: At least ${requiredPhotos} photo${requiredPhotos > 1 ? 's' : ''} required ${
          isConditionIssue || isTagIssue ? 'when there is a condition or tag issue' : 'when asset is Found'
        }.`
      );
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Capture GPS (graceful fallback)
      const gps = await getCurrentGPSLocation();

      // 2. Insert or update verification in public.verification
      const { data: verifData, error: verifErr } = await supabase
        .from('verification')
        .upsert(
          {
            tag_no: asset.tag_no,
            engagement_id: asset.engagement_id || null,
            found,
            count_date: new Date().toISOString().split('T')[0],
            counter_id: user?.id || null,
            location_id: currentRoomId || null,
            department: department.trim() || null,
            custodian: custodian.trim() || null,
            tag_status: tagStatus,
            serial_no: serialNo.trim() || null,
            brand_model: brandModel.trim() || null,
            physical_qty: physicalQty,
            condition,
            in_use: inUse,
            remarks: remarks.trim() || null,
            gps_lat: gps.latitude,
            gps_lng: gps.longitude,
            gps_accuracy: gps.accuracy,
          },
          { onConflict: 'tag_no' }
        )
        .select('id')
        .single();

      if (verifErr || !verifData) {
        throw new Error(verifErr?.message || 'Failed to save verification');
      }

      const verificationId = verifData.id;

      // 3. Upload evidence photos to Supabase Storage
      for (let i = 0; i < photos.length; i++) {
        const item = photos[i];
        const timestamp = Date.now();
        const engFolder = asset.engagement_id || 'default_eng';
        const storagePath = `${engFolder}/${asset.tag_no}/${timestamp}_${i + 1}.jpg`;

        const { error: uploadErr } = await supabase.storage
          .from('evidence')
          .upload(storagePath, item.file, { contentType: 'image/jpeg' });

        if (!uploadErr) {
          // Record in public.photo
          await supabase.from('photo').insert({
            verification_id: verificationId,
            file_path: storagePath,
            file_hash: item.hash,
            photo_type: i === 0 ? 'asset' : isConditionIssue ? 'damage' : 'tag',
            gps_lat: gps.latitude,
            gps_lng: gps.longitude,
          });
        }
      }

      // 4. Return straight to camera scanner
      onSaveAndScanNext();
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Save verification error:', error);
      setErrorMsg(error.message || 'Error saving verification record.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end sm:justify-center p-0 sm:p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-brand-800 text-white rounded-t-3xl sm:rounded-t-2xl">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-lg font-black tracking-wider text-white">
                {asset.tag_no}
              </span>
              <span className="text-[10px] bg-brand-700 text-blue-100 px-2 py-0.5 rounded-full font-bold uppercase">
                {asset.method}
              </span>
            </div>
            <p className="text-[11px] text-blue-200 mt-0.5">
              Room: {currentRoomName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-medium">{errorMsg}</div>
            </div>
          )}

          {/* Asset Info Card (Strictly NO cost / NBV) */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <h4 className="font-bold text-sm text-slate-900 leading-snug">
              {asset.description}
            </h4>
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>Class: {asset.asset_class}</span>
              <span>FAR Qty: <strong className="text-slate-800">{asset.far_qty}</strong></span>
            </div>
          </div>

          {/* 1. Found Chip Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Asset Found?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Yes', 'No', 'Not Accessible'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFound(opt)}
                  className={`min-h-[48px] rounded-xl text-xs font-bold border transition-all ${
                    found === opt
                      ? opt === 'Yes'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : opt === 'No'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {found === 'Yes' && (
            <>
              {/* 2. Condition Tap Chips */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Physical Condition
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Good', 'Fair', 'Poor', 'Damaged', 'Idle', 'Not Working'] as AssetCondition[]).map(
                    (cond) => {
                      const isIssue = ['Poor', 'Damaged', 'Idle', 'Not Working'].includes(cond);
                      const isSelected = condition === cond;
                      return (
                        <button
                          key={cond}
                          type="button"
                          onClick={() => setCondition(cond)}
                          className={`min-h-[46px] rounded-xl text-xs font-semibold border transition-all ${
                            isSelected
                              ? isIssue
                                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                : 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {cond}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* 3. Tag Status Tap Chips */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Physical Tag Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    'Tag OK',
                    'Tag Damaged/Unreadable',
                    'Tag Missing - identified by serial',
                    'Tag Missing - identified by description',
                    'Re-tagged',
                  ] as TagStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setTagStatus(status)}
                      className={`min-h-[46px] px-2 rounded-xl text-[11px] font-semibold border transition-all text-center leading-tight ${
                        tagStatus === status
                          ? status === 'Tag OK'
                            ? 'bg-brand-700 text-white border-brand-700 shadow-sm'
                            : 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                {tagStatus === 'Re-tagged' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="New ACNABIN Tag No (e.g. RH-TG-00501)"
                      value={reTagNumber}
                      onChange={(e) => setReTagNumber(e.target.value)}
                      className="w-full min-h-[46px] px-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl"
                    />
                  </div>
                )}
              </div>

              {/* 4. In Use Toggle & Physical Qty (if far_qty > 1) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Currently In Use?
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setInUse(true)}
                      className={`min-h-[46px] rounded-xl text-xs font-bold border transition-all ${
                        inUse ? 'bg-brand-700 text-white border-brand-700' : 'bg-slate-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setInUse(false)}
                      className={`min-h-[46px] rounded-xl text-xs font-bold border transition-all ${
                        !inUse ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-700 border-slate-300'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Only show Physical Qty if far_qty > 1 */}
                {asset.far_qty > 1 ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Physical Qty (FAR: {asset.far_qty})
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={physicalQty}
                      onChange={(e) => setPhysicalQty(parseFloat(e.target.value) || 0)}
                      className="w-full min-h-[46px] text-center font-bold text-sm bg-slate-50 border border-slate-300 rounded-xl"
                    />
                  </div>
                ) : (
                  <div className="flex items-center text-xs text-slate-500 pt-5">
                    Single unit asset (Qty = 1)
                  </div>
                )}
              </div>

              {/* 5. Serial Number & Brand/Model */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Serial No.
                  </label>
                  <input
                    type="text"
                    placeholder="Manufacturer S/N"
                    value={serialNo}
                    onChange={(e) => setSerialNo(e.target.value)}
                    className="w-full min-h-[46px] px-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Brand / Model
                  </label>
                  <input
                    type="text"
                    placeholder="Brand / Model"
                    value={brandModel}
                    onChange={(e) => setBrandModel(e.target.value)}
                    className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              {/* 6. Department & Custodian */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Accounts, HR"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    User / Custodian
                  </label>
                  <input
                    type="text"
                    placeholder="Custodian Name"
                    value={custodian}
                    onChange={(e) => setCustodian(e.target.value)}
                    className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
            </>
          )}

          {/* Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Remarks (if unusual or exception)
            </label>
            <input
              type="text"
              placeholder="e.g. Broken screen, unverified cable..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full min-h-[46px] px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl"
            />
          </div>

          {/* 7. Photo Capture Section */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Photo Evidence ({photos.length} / {requiredPhotos} required)
                </label>
                <p className="text-[10px] text-slate-500">
                  Compressed on device to ~300KB (max 1600px).
                </p>
              </div>

              <label className="min-h-[48px] px-3.5 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold text-xs rounded-xl border border-brand-200 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform">
                <Camera className="w-4 h-4" />
                <span>Take Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCapturePhoto}
                  className="hidden"
                />
              </label>
            </div>

            {/* Photo thumbnails */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {photos.map((item, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-slate-100"
                  >
                    <img
                      src={item.previewUrl}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 p-1 bg-black/70 hover:bg-rose-600 text-white rounded-full transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">
                      #{idx + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-[52px] px-4 py-3 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-300 text-xs transition-colors shrink-0"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 min-h-[52px] px-4 py-3 bg-brand-700 hover:bg-brand-800 active:scale-[0.99] text-white font-bold rounded-xl shadow-md text-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Saving Verification...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>Save &amp; Scan Next</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

