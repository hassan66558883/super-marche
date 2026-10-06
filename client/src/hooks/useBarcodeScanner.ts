import { useEffect, useRef } from 'react';

/**
 * Keyboard-emulating barcode scanners "type" the code very fast and finish with Enter.
 * This catches such bursts when focus is NOT in a text field (inputs handle Enter themselves),
 * so a scan works even after the cashier clicked a button.
 */
export function useBarcodeScanner(onScan: (code: string) => void, opts: { enabled?: boolean; minLength?: number; maxGapMs?: number } = {}) {
  const cb = useRef(onScan);
  cb.current = onScan;
  const { enabled = true, minLength = 4, maxGapMs = 50 } = opts;

  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const now = performance.now();
      if (now - last > maxGapMs) buffer = '';
      last = now;
      if (e.key === 'Enter') {
        if (buffer.length >= minLength) {
          e.preventDefault();
          cb.current(buffer);
        }
        buffer = '';
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) buffer += e.key;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, minLength, maxGapMs]);
}
