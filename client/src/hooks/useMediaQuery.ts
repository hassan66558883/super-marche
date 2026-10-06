import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** POS layout breakpoints: desktop = 3 columns, tablet = 2 columns + drawer, mobile = tabs */
export function usePosLayout(): 'desktop' | 'tablet' | 'mobile' {
  const desktop = useMediaQuery('(min-width: 1280px)');
  const tablet = useMediaQuery('(min-width: 768px)');
  return desktop ? 'desktop' : tablet ? 'tablet' : 'mobile';
}
