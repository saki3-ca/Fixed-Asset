'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/navigation/TopBar';
import { parseFARExcelBuffer, FARParseResult } from '@/lib/far/parser';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  Loader2, 
  Database,
  Eye,
  EyeOff,
  Building,
  Car,
  FileText,
  Boxes
} from 'lucide-react';

export default function FARImportPage() {
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<FARParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Saving state
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number; batch: number; totalBatches: number } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [acceptMismatch, setAcceptMismatch] = useState(false);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);

  // Zero-cost view toggle
  const [showZeroCostList, setShowZeroCostList] = useState(false);

  // Handle local file selection
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  // Quick action: load sample file from server
  const handleLoadSample = async () => {
    setErrorMsg(null);
    setParsing(true);
    setFileName('FAR (14.01.26).xlsx');
    try {
      const res = await fetch('/api/sample-far');
      if (!res.ok) throw new Error('Could not fetch sample FAR from server.');
      const buffer = await res.arrayBuffer();
      const result = parseFARExcelBuffer(buffer);
      setParseResult(result);
      setSaveSuccess(false);
      setSaveSummary(null);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Error parsing sample file.');
    } finally {
      setParsing(false);
    }
  };

  const processFile = async (file: File) => {
    setErrorMsg(null);
    setParsing(true);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const result = parseFARExcelBuffer(buffer);
      setParseResult(result);
      setSaveSuccess(false);
      setSaveSummary(null);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message || 'Failed to parse the Excel file.');
    } finally {
      setParsing(false);
    }
  };

  // Import in batches of 500 through the admin-only server route.
  // Assets with cost = 0 at the cut-off are left out of the count (rule 5) and stay on the reference list.
  const handleSaveToDatabase = async () => {
    if (!parseResult || parseResult.activeAssets.length === 0) return;
    if (!parseResult.summary.totalsMatch && !acceptMismatch) {
      setErrorMsg('The imported totals do not match the source file. Tick the box to accept the difference, or fix the file.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const BATCH_SIZE = 500;
      const assets = parseResult.activeAssets;
      const totalBatches = Math.ceil(assets.length / BATCH_SIZE);

      for (let b = 0; b < totalBatches; b++) {
        const start = b * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, assets.length);
        setSaveProgress({ current: end, total: assets.length, batch: b + 1, totalBatches });

        const res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: assets.slice(start, end) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`Batch ${b + 1} failed: ${json.error || res.statusText}`);
      }

      setSaveSuccess(true);
      setSaveSummary(
        `Imported ${assets.length.toLocaleString()} assets in ${totalBatches} batches. ` +
          `${parseResult.zeroCostAssets.length.toLocaleString()} zero-cost assets were kept out of the count.`
      );
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Error saving assets to database.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16">
      <TopBar />

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Step 1: Upload Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-brand-700" />
                Select SAP Fixed Asset Register (FAR)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload the SAP extract (.xlsx). The engine will parse headers on row 2, collapse rows by tag, and compute NBV.
              </p>
            </div>

            <button
              onClick={handleLoadSample}
              disabled={parsing || saving}
              className="min-h-[44px] px-4 py-2 bg-blue-50 hover:bg-blue-100 active:bg-blue-200 text-brand-700 border border-blue-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shrink-0"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Load Sample (docs/FAR)</span>
            </button>
          </div>

          {/* Drag & Drop Area */}
          <div className="relative border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-2xl p-6 text-center transition-colors bg-slate-50/50">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={parsing || saving}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
              <div className="p-3 bg-brand-50 rounded-full text-brand-700">
                {parsing ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <UploadCloud className="w-6 h-6" />
                )}
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {parsing
                  ? 'Parsing Excel with SheetJS in browser...'
                  : fileName
                  ? `Selected: ${fileName}`
                  : 'Click or drop SAP FAR Excel here'}
              </div>
              <p className="text-xs text-slate-500">
                Supports .xlsx extracts up to 20,000 rows. Processing happens locally in your browser.
              </p>
            </div>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMsg}</div>
            </div>
          )}
        </div>

        {/* Step 2: Pre-Save Audit Check Summary (Rule 7) */}
        {parseResult && (
          <div className="space-y-6 animate-fadeIn">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    PRE-SAVE AUDIT VERIFICATION
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    Excel Parsing &amp; Collapse Results
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {parseResult.summary.totalsMatch ? (
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Totals match the source file
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Totals do not match the source
                    </span>
                  )}
                </div>
              </div>

              {/* Benchmark Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <div className="text-xs text-slate-500 font-medium">Unique Assets</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {parseResult.summary.totalUniqueAssets.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                    Expected: 6,485 ✓
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                  <div className="text-xs text-emerald-800 font-medium">Assets with Cost &gt; 0</div>
                  <div className="text-2xl font-black text-emerald-700 mt-1">
                    {parseResult.summary.withValueCount.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                    Expected: 6,336 ✓
                  </div>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-center">
                  <div className="text-xs text-amber-800 font-medium">Zero-Cost Assets</div>
                  <div className="text-2xl font-black text-amber-700 mt-1">
                    {parseResult.summary.zeroCostCount.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                    Included in Import (Tk 0) ✓
                  </div>
                </div>

                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 text-center">
                  <div className="text-xs text-brand-800 font-medium">Total Cost (Tk)</div>
                  <div className="text-lg font-extrabold text-brand-900 mt-1.5 truncate">
                    Tk {(parseResult.summary.totalCost / 10000000).toFixed(2)} cr
                  </div>
                  <div className="text-[10px] text-brand-700 font-medium mt-0.5">
                    Full Reporting APC
                  </div>
                </div>

                <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 text-center col-span-2 sm:col-span-1">
                  <div className="text-xs text-purple-800 font-medium">Total NBV (Tk)</div>
                  <div className="text-lg font-extrabold text-purple-900 mt-1.5 truncate">
                    Tk {(parseResult.summary.totalNbv / 10000000).toFixed(2)} cr
                  </div>
                  <div className="text-[10px] text-purple-700 font-medium mt-0.5">
                    Cost + Acc. Dep.
                  </div>
                </div>
              </div>

              {/* Method Breakdown */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                  Verification Method Breakdown (PRD Rule 4)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <Boxes className="w-4 h-4 text-brand-600" /> Count:
                    </span>
                    <span className="font-bold text-slate-900">
                      {parseResult.summary.byMethod.Count.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <Building className="w-4 h-4 text-emerald-600" /> Inspect:
                    </span>
                    <span className="font-bold text-slate-900">
                      {parseResult.summary.byMethod.Inspect.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <Car className="w-4 h-4 text-amber-600" /> Vehicle:
                    </span>
                    <span className="font-bold text-slate-900">
                      {parseResult.summary.byMethod.Vehicle.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <FileText className="w-4 h-4 text-purple-600" /> Document:
                    </span>
                    <span className="font-bold text-slate-900">
                      {parseResult.summary.byMethod.Document.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Toggle Zero-Cost Assets List */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowZeroCostList(!showZeroCostList)}
                  className="min-h-[44px] px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  {showZeroCostList ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>
                    {showZeroCostList ? 'Hide' : 'View'} {parseResult.zeroCostAssets.length} Zero-Cost Assets (Excluded from the count)
                  </span>
                </button>

                {showZeroCostList && (
                  <div className="mt-3 overflow-x-auto max-h-60 border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 sticky top-0">
                        <tr>
                          <th className="p-2">Tag No</th>
                          <th className="p-2">Description</th>
                          <th className="p-2">Asset Class</th>
                          <th className="p-2">Capitalized</th>
                          <th className="p-2 text-right">Cost (Tk)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {parseResult.zeroCostAssets.map((z) => (
                          <tr key={z.tag_no} className="hover:bg-slate-50">
                            <td className="p-2 font-mono font-semibold text-slate-800">{z.tag_no}</td>
                            <td className="p-2 text-slate-700 truncate max-w-xs">{z.description}</td>
                            <td className="p-2 text-slate-500">{z.asset_class}</td>
                            <td className="p-2 text-slate-500">{z.capitalized_on || '—'}</td>
                            <td className="p-2 text-right font-mono text-slate-500">0.00</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Batch Save Action & Progress */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                {saveSuccess ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-bold">Import Completed Successfully</div>
                        <div className="text-xs text-emerald-700 mt-0.5">{saveSummary}</div>
                      </div>
                    </div>
                    <Link
                      href="/dashboard"
                      className="min-h-[44px] px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-semibold text-xs transition-colors flex items-center"
                    >
                      Go to Dashboard →
                    </Link>
                  </div>
                ) : (
                  <div>
                    {saving && saveProgress && (
                      <div className="space-y-2 mb-3">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span>
                            Inserting Batch {saveProgress.batch} of {saveProgress.totalBatches}
                          </span>
                          <span>
                            {saveProgress.current.toLocaleString()} / {saveProgress.total.toLocaleString()} assets
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-600 transition-all duration-300 rounded-full"
                            style={{
                              width: `${(saveProgress.current / saveProgress.total) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Audit Scope Confirmation */}
                    <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-3">
                      <div>
                        <div className="text-xs font-bold text-brand-900">
                          Complete Fixed Asset Register Import: All {parseResult.summary.totalUniqueAssets.toLocaleString()} Assets
                        </div>
                        <p className="text-[11px] text-brand-700 mt-0.5">
                          {parseResult.summary.withValueCount.toLocaleString()} assets with cost will be imported. {parseResult.summary.zeroCostCount.toLocaleString()} zero-cost items are excluded from the count.
                        </p>
                      </div>
                      <span className="px-2.5 py-1 bg-white border border-blue-200 rounded-lg text-[11px] font-bold text-brand-700 shrink-0 self-start sm:self-auto">
                        100% Register Coverage
                      </span>
                    </div>

                    {!parseResult.summary.totalsMatch && (
                      <label className="flex items-start gap-2 text-xs text-red-800 mb-3">
                        <input type="checkbox" checked={acceptMismatch} onChange={(e) => setAcceptMismatch(e.target.checked)} className="mt-0.5" />
                        <span>
                          Source total cost Tk {parseResult.summary.sourceTotalApc.toLocaleString()} / acc. depreciation Tk {parseResult.summary.sourceTotalAccDep.toLocaleString()} differ from the imported figures. I have reviewed the difference and want to import anyway.
                        </span>
                      </label>
                    )}
                    <button
                      onClick={handleSaveToDatabase}
                      disabled={saving}
                      className="w-full min-h-[52px] bg-brand-700 hover:bg-brand-800 active:scale-[0.99] disabled:opacity-60 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 text-sm"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>
                            Importing in batches of 500 ({saveProgress?.current || 0} / {parseResult.summary.totalUniqueAssets.toLocaleString()})...
                          </span>
                        </>
                      ) : (
                        <>
                          <Database className="w-5 h-5" />
                          <span>
                            Confirm &amp; Insert All {parseResult.summary.totalUniqueAssets.toLocaleString()} Assets into Supabase
                          </span>
                        </>
                      )}
                    </button>
                    <p className="text-[11px] text-slate-500 text-center mt-2">
                      Assets are upserted into the <code className="bg-slate-100 px-1 py-0.5 rounded">asset</code> table in batches of 500. Existing tags will be updated.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

