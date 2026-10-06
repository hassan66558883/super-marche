import { useTranslation } from 'react-i18next';
import type { Sale } from '@/types/sales';
import type { AppSettings } from '@/types/settings';
import { D, formatMoney, formatNumber, formatQty } from '@/utils/money';
import { formatDate, formatDateTime } from '@/utils/format';
import { buildReceipt } from './receipt-model';

/** A4 invoice: company header, customer block, detailed lines, VAT breakdown, payments. */
export function InvoiceA4({ sale, settings, duplicate }: { sale: Sale; settings?: AppSettings; duplicate?: boolean }) {
  const { t } = useTranslation();
  const doc = buildReceipt(sale, settings, duplicate);
  const c = settings?.company;
  return (
    <div className="mx-auto flex min-h-[297mm] w-[210mm] flex-col bg-white p-[14mm] text-[11.5px] leading-relaxed text-black">
      <div className="flex items-start justify-between border-b-2 border-[#1e3a8a] pb-4">
        <div>
          {c?.logoUrl ? <img src={c.logoUrl} alt="" className="mb-2 h-12" /> : <img src="/logo.svg" alt="" className="mb-2 h-10" />}
          <div className="text-xl font-extrabold text-[#1e3a8a]">{c?.name ?? 'TECHNOVA POS'}</div>
          {c?.legalName && <div className="font-medium">{c.legalName}</div>}
          <div>{sale.branch.name}</div>
          {(sale.branch.address || c?.address) && <div>{sale.branch.address ?? c?.address}</div>}
          {(sale.branch.phone || c?.phone) && <div>Tél : {sale.branch.phone ?? c?.phone}</div>}
          {c?.email && <div>{c.email}</div>}
          <div>{c?.taxId && `${t('receipt.taxId')} : ${c.taxId}`}{c?.rccm && ` · ${t('receipt.rccm')} : ${c.rccm}`}</div>
        </div>
        <div className="text-end">
          <div className="text-3xl font-extrabold uppercase tracking-wide text-[#1e3a8a]">{t('receipt.invoice')}</div>
          <div className="mt-1 text-base font-bold">{t('receipt.invoiceNo')} {sale.invoiceNumber}</div>
          <div>{t('receipt.date')} : {formatDateTime(sale.createdAt)}</div>
          <div>{t('receipt.cashier')} : {sale.cashier.fullName}</div>
          {duplicate && <div className="mt-2 inline-block border-2 border-black px-2 font-bold">{t('receipt.duplicate')}</div>}
          {sale.status === 'CANCELLED' && <div className="mt-2 inline-block border-2 border-red-700 px-2 font-bold text-red-700">{t('sales.statusCANCELLED').toUpperCase()}</div>}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-6">
        <div className="rounded border border-gray-300 p-3">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">{t('receipt.customer')}</div>
          {sale.customer && sale.customer.type !== 'WALK_IN' ? (
            <>
              <div className="font-bold">{sale.customer.name}</div>
              <div>{sale.customer.code}</div>
              {sale.customer.address && <div>{sale.customer.address}</div>}
              {sale.customer.phone && <div>{sale.customer.phone}</div>}
              {sale.customer.taxId && <div>{t('receipt.taxId')} : {sale.customer.taxId}</div>}
            </>
          ) : <div className="font-bold">{t('common.walkIn')}</div>}
        </div>
        {D(sale.amountDue).gt(0) && (
          <div className="rounded border border-gray-300 p-3">
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">{t('receipt.balanceDue')}</div>
            <div className="text-lg font-bold">{formatMoney(sale.amountDue)}</div>
            {sale.dueDate && <div>{t('receipt.dueDate')} : {formatDate(sale.dueDate)}</div>}
          </div>
        )}
      </div>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="bg-[#1e3a8a] text-white">
            <th className="p-2 text-start">#</th>
            <th className="p-2 text-start">{t('receipt.designation')}</th>
            <th className="p-2 text-end">{t('receipt.qty')}</th>
            <th className="p-2 text-end">{t('receipt.unitPrice')}</th>
            <th className="p-2 text-end">{t('receipt.discount')}</th>
            <th className="p-2 text-end">{t('receipt.vat')}</th>
            <th className="p-2 text-end">{t('receipt.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it, i) => (
            <tr key={it.id} className="border-b border-gray-200">
              <td className="p-2">{i + 1}</td>
              <td className="p-2"><div className="font-medium">{it.productName}</div><div className="text-[10px] text-gray-500">{it.sku}</div></td>
              <td className="p-2 text-end tabular">{formatQty(it.quantity)}</td>
              <td className="p-2 text-end tabular">{formatNumber(it.unitPrice)}</td>
              <td className="p-2 text-end tabular">{D(it.discountAmount).plus(D(it.cartDiscountShare)).gt(0) ? `-${formatNumber(D(it.discountAmount).plus(D(it.cartDiscountShare)))}` : '—'}</td>
              <td className="p-2 text-end tabular">{D(it.taxRate).toString()}%</td>
              <td className="p-2 text-end font-semibold tabular">{formatNumber(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-5 flex justify-between gap-8">
        <div className="flex-1">
          {doc.totals.taxByRate.length > 0 && (
            <table className="w-full max-w-sm border-collapse text-[11px]">
              <thead><tr className="border-b border-gray-400"><th className="py-1 text-start">{t('receipt.vat')}</th><th className="py-1 text-end">{t('receipt.taxBase')}</th><th className="py-1 text-end">{t('receipt.taxAmount')}</th></tr></thead>
              <tbody>{doc.totals.taxByRate.map((x) => <tr key={x.rate}><td className="py-1">{x.rate}%</td><td className="py-1 text-end tabular">{formatNumber(x.base)}</td><td className="py-1 text-end tabular">{formatNumber(x.tax)}</td></tr>)}</tbody>
            </table>
          )}
          <div className="mt-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{t('receipt.paymentMethod')}</div>
            {doc.payments.map((p, i) => <div key={i}>{p.name}{p.reference ? ` (${p.reference})` : ''} : {formatMoney(p.amount)}</div>)}
            {doc.change.gt(0) && <div>{t('receipt.change')} : {formatMoney(doc.change)}</div>}
          </div>
        </div>
        <div className="w-72 space-y-1">
          <div className="flex justify-between"><span>{t('pos.subtotal')}</span><span className="tabular">{formatMoney(sale.subtotal)}</span></div>
          {D(sale.discountTotal).gt(0) && <div className="flex justify-between"><span>{t('receipt.discount')}</span><span className="tabular">-{formatMoney(sale.discountTotal)}</span></div>}
          <div className="flex justify-between"><span>{t('receipt.subtotal')}</span><span className="tabular">{formatMoney(D(sale.total).minus(D(sale.taxTotal)))}</span></div>
          <div className="flex justify-between"><span>{t('receipt.vat')}</span><span className="tabular">{formatMoney(sale.taxTotal)}</span></div>
          <div className="flex justify-between border-t-2 border-[#1e3a8a] pt-2 text-lg font-extrabold"><span>{t('receipt.totalTtc')}</span><span className="tabular">{formatMoney(sale.total)}</span></div>
          {D(sale.amountDue).gt(0) && <div className="flex justify-between font-bold"><span>{t('receipt.balanceDue')}</span><span className="tabular">{formatMoney(sale.amountDue)}</span></div>}
        </div>
      </div>

      <div className="mt-auto pt-10">
        <div className="mb-8 flex justify-end"><div className="w-56 border-t border-gray-400 pt-1 text-center text-[10px]">{t('receipt.signature')}</div></div>
        <div className="border-t border-gray-300 pt-3 text-center font-semibold text-[#1e3a8a]">{doc.footer}</div>
        {c?.slogan && <div className="text-center text-[10px] text-gray-500">{c.slogan}</div>}
      </div>
    </div>
  );
}
