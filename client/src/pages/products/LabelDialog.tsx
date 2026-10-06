import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarcodeSvg } from '@/components/shared/BarcodeSvg';
import { formatMoney } from '@/utils/money';
import type { Product } from '@/types/catalog';

/** Shelf / product labels (50×30 mm grid) printed through the browser. */
export function LabelDialog({ product, onOpenChange }: { product: Product | null; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const [copies, setCopies] = useState(1);
  if (!product) return null;
  const code = product.barcode ?? product.sku;
  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{t('products.printLabel')}</DialogTitle></DialogHeader>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="copies">{t('common.quantity')}</Label>
            <Input id="copies" type="number" min={1} max={200} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className="w-28" />
          </div>
        </div>
        <div className="print-area max-h-[50vh] overflow-auto rounded-lg border bg-white p-3 text-black">
          <div className="grid grid-cols-3 gap-2 print:grid-cols-4">
            {Array.from({ length: copies }).map((_, i) => (
              <div key={i} className="flex h-[30mm] w-[50mm] flex-col items-center justify-center rounded border border-dashed border-gray-300 p-1 text-center">
                <div className="line-clamp-1 text-[10px] font-semibold leading-tight">{product.name}</div>
                <div className="text-sm font-extrabold leading-tight">{formatMoney(product.sellingPrice)}</div>
                <BarcodeSvg value={code} height={28} width={1.2} fontSize={9} />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
          <Button onClick={() => window.print()}><Printer /> {t('common.print')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
