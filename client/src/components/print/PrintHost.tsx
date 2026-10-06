import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePrintStore } from '@/stores/print.store';
import { useSettings } from '@/hooks/useSettings';
import { Receipt80 } from './Receipt80';
import { InvoiceA4 } from './InvoiceA4';
import { buildReceipt } from './receipt-model';
import { ZReport80 } from './ZReport80';

/**
 * Renders the queued document into a print-only area, sets the page size
 * (80 mm roll or A4) and opens the browser print dialog.
 */
export function PrintHost() {
  const job = usePrintStore((s) => s.job);
  const done = usePrintStore((s) => s.done);
  const settings = useSettings();

  useEffect(() => {
    if (!job) return;
    const width = settings.data?.receipt.paperWidth ?? 80;
    const style = document.createElement('style');
    style.textContent = job.kind !== 'invoice' ? `@page { size: ${width}mm auto; margin: 0; }` : '@page { size: A4; margin: 0; }';
    document.head.appendChild(style);
    const after = () => { style.remove(); done(); };
    window.addEventListener('afterprint', after, { once: true });
    // Let the barcode SVG render before printing
    const timer = window.setTimeout(() => window.print(), 250);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', after); style.remove(); };
  }, [job, done, settings.data]);

  if (!job) return null;
  return createPortal(
    <div className="print-area pointer-events-none fixed left-[-10000px] top-0" aria-hidden>
      {job.kind === 'zreport' ? <ZReport80 summary={job.summary} settings={settings.data} width={settings.data?.receipt.paperWidth ?? 80} />
        : job.kind === 'receipt'
          ? <Receipt80 doc={buildReceipt(job.sale, settings.data, job.duplicate)} width={settings.data?.receipt.paperWidth ?? 80} />
          : <InvoiceA4 sale={job.sale} settings={settings.data} duplicate={job.duplicate} />}
    </div>,
    document.body,
  );
}
