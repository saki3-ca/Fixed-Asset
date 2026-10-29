// Web Audio API beep sound generator for successful barcode scan
let audioCtx: AudioContext | null = null;

export function playScanBeep() {
  try {
    if (typeof window === 'undefined') return;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx || audioCtx.state === 'suspended') {
      audioCtx = new AudioContextClass();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 tone (crisp high beep)

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);

    // Haptic vibration feedback on phones
    if (navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(80);
    }
  } catch (err) {
    console.warn('Audio beep playback failed:', err);
  }
}

