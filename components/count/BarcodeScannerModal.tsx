'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { playScanBeep } from '@/lib/audio/beep';
import { X, Flashlight, FlashlightOff, Search, Keyboard, AlertCircle } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
  onOpenTypeTag: () => void;
  onOpenSearch: () => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  onOpenTypeTag,
  onOpenSearch,
}) => {
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'mobile-html5-qr-reader';

  useEffect(() => {
    if (!isOpen) {
      cleanupScanner();
      return;
    }

    let isMounted = true;

    async function startScanner() {
      setErrorMsg(null);
      try {
        // Formats to detect: Code 128, Code 39, QR, EAN-13, DataMatrix
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
        ];

        const html5QrCode = new Html5Qrcode(scannerContainerId, {
          formatsToSupport,
          verbose: false,
        });
        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: { width: 280, height: 180 },
          aspectRatio: 1.0,
        };

        await html5QrCode.start(
          { facingMode: 'environment' }, // Prefer rear camera
          config,
          (decodedText) => {
            if (!isMounted) return;
            playScanBeep();
            cleanupScanner();
            onScanSuccess(decodedText.trim());
          },
          undefined // Ignore per-frame errors
        );

        if (isMounted) {
          setCameraActive(true);
          // Check torch capability
          try {
            const capabilities = html5QrCode.getRunningTrackCapabilities() as MediaTrackCapabilities & { torch?: boolean };
            if (capabilities && capabilities.torch) {
              setTorchSupported(true);
            }
          } catch {
            setTorchSupported(false);
          }
        }
      } catch (err: unknown) {
        const error = err as Error;
        console.error('Camera initialization error:', error);
        if (isMounted) {
          setErrorMsg(
            error.message?.includes('Permission') || error.message?.includes('NotAllowed')
              ? 'Camera permission denied. Please allow camera access in Chrome settings.'
              : 'Could not access the rear camera. You can type the tag number below.'
          );
        }
      }
    }

    // Small delay to ensure modal DOM container is rendered
    const timer = setTimeout(() => {
      startScanner();
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      cleanupScanner();
    };
  }, [isOpen]);

  const cleanupScanner = () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {});
        }
      } catch (e) {
        console.warn('Error stopping scanner:', e);
      }
      scannerRef.current = null;
    }
    setCameraActive(false);
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !torchSupported) return;
    try {
      const nextState = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet],
      });
      setTorchOn(nextState);
    } catch (e) {
      console.warn('Failed to toggle torch:', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between text-white animate-fadeIn">
      {/* Top Controls Bar */}
      <div className="p-4 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
        <button
          onClick={onClose}
          aria-label="Close Scanner"
          className="p-3 bg-white/20 hover:bg-white/30 active:scale-95 rounded-full transition-transform min-h-[48px] min-w-[48px] flex items-center justify-center"
        >
          <X className="w-6 h-6 text-white" />
        </button>

        <div className="text-center">
          <span className="font-bold text-sm tracking-wide block">Point at Asset Tag</span>
          <span className="text-[11px] text-blue-200">SAP 8-Digit Barcode or QR</span>
        </div>

        {torchSupported ? (
          <button
            onClick={toggleTorch}
            aria-label="Toggle Torch"
            className={`p-3 rounded-full transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center ${
              torchOn ? 'bg-amber-400 text-black' : 'bg-white/20 text-white'
            }`}
          >
            {torchOn ? <FlashlightOff className="w-6 h-6" /> : <Flashlight className="w-6 h-6" />}
          </button>
        ) : (
          <div className="w-12 h-12" />
        )}
      </div>

      {/* Camera Viewport Area */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-4 overflow-hidden">
        {errorMsg ? (
          <div className="p-6 bg-rose-950/80 border border-rose-500/50 rounded-2xl text-center max-w-sm space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
            <div className="text-sm font-semibold text-rose-100">{errorMsg}</div>
            <button
              onClick={() => {
                onClose();
                onOpenTypeTag();
              }}
              className="w-full min-h-[48px] px-4 py-2.5 bg-white text-slate-900 rounded-xl font-bold text-xs shadow-md mt-2"
            >
              Type Tag Number Instead
            </button>
          </div>
        ) : (
          <div className="w-full max-w-sm relative">
            {/* Target reticle styling */}
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
              <div className="w-72 h-48 border-2 border-brand-400/80 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                {/* Corner markers */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-brand-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-brand-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-brand-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-brand-400 rounded-br-lg" />

                {/* Laser animation line */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse" />
              </div>
            </div>

            {/* html5-qrcode video element container */}
            <div
              id={scannerContainerId}
              className="w-full rounded-2xl overflow-hidden bg-black"
              style={{ minHeight: '320px' }}
            />
          </div>
        )}
      </div>

      {/* Fallback Buttons Bar (Type tag & Search) */}
      <div className="p-4 pb-8 bg-gradient-to-t from-black via-black/90 to-transparent space-y-2 z-10">
        <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
          <button
            onClick={() => {
              cleanupScanner();
              onClose();
              onOpenTypeTag();
            }}
            className="flex items-center justify-center space-x-2 min-h-[50px] px-4 py-3 bg-white/15 hover:bg-white/25 active:bg-white/30 rounded-xl text-xs font-bold text-white transition-all backdrop-blur-md"
          >
            <Keyboard className="w-4 h-4 text-blue-300" />
            <span>Type Tag No.</span>
          </button>

          <button
            onClick={() => {
              cleanupScanner();
              onClose();
              onOpenSearch();
            }}
            className="flex items-center justify-center space-x-2 min-h-[50px] px-4 py-3 bg-white/15 hover:bg-white/25 active:bg-white/30 rounded-xl text-xs font-bold text-white transition-all backdrop-blur-md"
          >
            <Search className="w-4 h-4 text-emerald-300" />
            <span>Search Desc</span>
          </button>
        </div>
      </div>
    </div>
  );
};

