import { forwardRef, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/utils/cn';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  delay?: number;
  autoFocus?: boolean;
}

/** Debounced search box; emits after `delay` ms of inactivity. */
export const SearchInput = forwardRef<HTMLInputElement, Props>(({ value, onChange, placeholder, className, delay = 250, autoFocus }, ref) => {
  const [local, setLocal] = useState(value);
  const debounced = useDebounce(local, delay);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input ref={ref} value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} className="ps-9 pe-8" autoFocus={autoFocus} type="search" aria-label={placeholder} />
      {local && (
        <button type="button" className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => { setLocal(''); onChange(''); }} aria-label="Effacer">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
});
SearchInput.displayName = 'SearchInput';
