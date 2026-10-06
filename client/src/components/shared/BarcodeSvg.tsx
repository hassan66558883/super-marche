import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export function BarcodeSvg({ value, height = 40, width = 1.6, fontSize = 12, displayValue = true }: { value: string; height?: number; width?: number; fontSize?: number; displayValue?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      const format = /^\d{13}$/.test(value) ? 'EAN13' : 'CODE128';
      JsBarcode(ref.current, value, { format, height, width, fontSize, displayValue, margin: 0, background: 'transparent' });
    } catch {
      JsBarcode(ref.current, value, { format: 'CODE128', height, width, fontSize, displayValue, margin: 0 });
    }
  }, [value, height, width, fontSize, displayValue]);
  return <svg ref={ref} role="img" aria-label={`Code-barres ${value}`} />;
}
