import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Global keyboard shortcuts. Keys use KeyboardEvent.key names ("F2", "Escape", "Enter").
 * Function keys fire even while typing in inputs (POS cashiers live in the search box);
 * other keys are ignored when focus is in an editable field unless `allowInInputs` is set.
 */
export function useHotkeys(map: HotkeyMap, opts: { enabled?: boolean; allowInInputs?: string[] } = {}) {
  const ref = useRef(map);
  ref.current = map;
  const enabled = opts.enabled ?? true;
  const allow = opts.allowInInputs ?? [];

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const handler = ref.current[e.key];
      if (!handler) return;
      const target = e.target as HTMLElement | null;
      const editable = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const isFn = /^F\d{1,2}$/.test(e.key);
      if (editable && !isFn && !allow.includes(e.key)) return;
      // Leave the event to any open dialog (Radix handles Escape itself)
      if (document.querySelector('[role="dialog"][data-state="open"]') && !isFn) return;
      e.preventDefault();
      handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, allow.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}
