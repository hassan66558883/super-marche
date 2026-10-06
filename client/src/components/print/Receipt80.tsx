import { useTranslation } from 'react-i18next';
import type { ReceiptDoc } from './receipt-model';
import { formatMoney, formatNumber } from '@/utils/money';
import { formatDateTime, formatDate } from '@/utils/format';
import { BarcodeSvg } from '@/components/shared/BarcodeSvg';

/** 80 mm thermal receipt (≈ 72 mm printable). Pure black-on-white, monospace-friendly. */
export function Receipt80({ doc, width = 80 }: { doc: ReceiptDoc; width?: 58 | 80 }) {
  const { t } = useTranslation();
  const Row = ({ l, r, bold }: { l: React.ReactNode; r: React.ReactNode; bold?: boolean }) => (
    <div className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''}`}><span>{l}</span><span className="tabular text-end">{r}</span></div>
  );
  return (
    <div className="bg-white px-[3mm] py-[4mm] font-mono text-[11px] leading-[1.35] text-black" style={{ width: `${width}mm` }}>
      <div className="text-center">
        <div className="text-[15px] font-extrabold tracking-wide">{doc.header.name}</div>
        {doc.header.slogan && <div className="text-[9px]">{doc.header.slogan}</div>}
        <div>{doc.header.branch}</div>
        {doc.header.address && <div>{doc.header.address}</div>}
        {doc.header.phone && <div>Tél : {doc.header.phone}</div>}
        {(doc.header.taxId || doc.header.rccm) && <div>{doc.header.taxId && `${t('receipt.taxId')} ${doc.header.taxId}`} {doc.header.rccm && `· ${t('receipt.rccm')} ${doc.header.rccm}`}</div>}
      </div>
      {doc.meta.duplicate && <div className="my-1 border border-black text-center font-bold">{t('receipt.duplicate')}</div>}
      {doc.meta.status === 'CANCELLED' && <div className="my-1 border border-black text-center font-bold">{t('sales.statusCANCELLED').toUpperCase()}</div>}
      <div className="my-2 border-t border-dashed border-black" />
      <Row l={`${t('receipt.invoiceNo')} ${doc.meta.invoiceNumber}`} r="" bold />
      <Row l={t('receipt.date')} r={formatDateTime(doc.meta.date)} />
      <Row l={t('receipt.cashier')} r={doc.meta.cashier} />
      {doc.meta.customer && <Row l={t('receipt.customer')} r={doc.meta.customer} />}
      <div className="my-2 border-t border-dashed border-black" />
      {doc.lines.map((l, i) => (
        <div key={i} className="mb-1">
          <div className="font-semibold">{l.name}</div>
          <Row l={`${l.qty} × ${formatNumber(l.unitPrice)}`} r={formatNumber(l.total)} />
          {l.discount && <Row l={`  ${t('receipt.discount')}`} r={`-${formatNumber(l.discount)}`} />}
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      {doc.totals.discount.gt(0) && <Row l={t('receipt.discount')} r={`-${formatMoney(doc.totals.discount)}`} />}
      {doc.showTaxDetails && doc.totals.taxByRate.map((x) => (
        <Row key={x.rate} l={`${t('receipt.vat')} ${x.rate}% (${t('receipt.taxBase')} ${formatNumber(x.base)})`} r={formatNumber(x.tax)} />
      ))}
      <div className="my-1 flex justify-between text-[15px] font-extrabold"><span>{t('receipt.totalTtc')}</span><span className="tabular">{formatMoney(doc.totals.total)}</span></div>
      <div className="my-2 border-t border-dashed border-black" />
      {doc.payments.map((p, i) => <Row key={i} l={p.name + (p.reference ? ` (${p.reference})` : '')} r={formatNumber(p.amount)} />)}
      {doc.change.gt(0) && <><Row l={t('receipt.received')} r={formatNumber(doc.tendered)} /><Row l={t('receipt.change')} r={formatMoney(doc.change)} bold /></>}
      {doc.amountDue.gt(0) && <><Row l={t('receipt.balanceDue')} r={formatMoney(doc.amountDue)} bold />{doc.dueDate && <Row l={t('receipt.dueDate')} r={formatDate(doc.dueDate)} />}</>}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-center"><BarcodeSvg value={doc.barcode} height={34} width={1.2} fontSize={10} /></div>
      <div className="mt-2 text-center font-bold">{doc.footer}</div>
    </div>
  );
}
