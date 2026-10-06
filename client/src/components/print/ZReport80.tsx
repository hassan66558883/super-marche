import { useTranslation } from 'react-i18next';
import { D, formatMoney } from '@/utils/money';
import { formatDateTime } from '@/utils/format';
import type { AppSettings } from '@/types/settings';
import type { CashSummary } from '@/types/sales';

/** End-of-shift register report ("Rapport Z") on the receipt printer. */
export function ZReport80({ summary: s, settings, width = 80 }: { summary: CashSummary; settings?: AppSettings; width?: 58 | 80 }) {
  const { t } = useTranslation();
  const Row = ({ l, r, bold }: { l: React.ReactNode; r: React.ReactNode; bold?: boolean }) => (
    <div className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''}`}><span>{l}</span><span className="tabular text-end">{r}</span></div>
  );
  const hr = <div className="my-2 border-t border-dashed border-black" />;
  const closed = s.session.status === 'CLOSED';
  return (
    <div className="bg-white px-[3mm] py-[4mm] font-mono text-[11px] leading-[1.35] text-black" style={{ width: `${width}mm` }}>
      <div className="text-center">
        <div className="text-[15px] font-extrabold">{settings?.company.name ?? 'TECHNOVA POS'}</div>
        <div className="mt-1 text-[13px] font-bold">{closed ? t('cash.zReport').toUpperCase() : t('cash.xReport').toUpperCase()}</div>
        <div>{s.session.register.name}</div>
      </div>
      {hr}
      <Row l={t('cash.openedBy')} r={s.session.openedBy.fullName} />
      <Row l={t('cash.openedAt')} r={formatDateTime(s.session.openedAt)} />
      {closed && <Row l={t('cash.closedAt')} r={formatDateTime(s.session.closedAt)} />}
      {closed && s.session.closedBy && <Row l={t('cash.closedBy')} r={s.session.closedBy.fullName} />}
      <Row l={t('cash.printedAt')} r={formatDateTime(new Date())} />
      {hr}
      <Row l={t('dashboard.transactions')} r={s.salesCount} />
      <Row l={t('cash.salesTotal')} r={formatMoney(s.salesTotal)} bold />
      {hr}
      <div className="mb-1 font-bold">{t('cash.salesByMethod')}</div>
      {s.byMethod.map((m) => <Row key={m.code} l={m.name} r={formatMoney(m.net)} />)}
      {!s.byMethod.length && <div>—</div>}
      {hr}
      <div className="mb-1 font-bold">{t('cash.drawer')}</div>
      <Row l={t('cash.opening')} r={formatMoney(s.opening)} />
      <Row l={t('cash.cashSales')} r={formatMoney(s.cashSales)} />
      <Row l={t('cash.cashRefunds')} r={formatMoney(s.cashRefunds)} />
      <Row l={t('cash.cashExpenses')} r={formatMoney(s.cashExpenses)} />
      <Row l={t('cash.cashIn')} r={formatMoney(s.cashIn)} />
      <Row l={t('cash.cashOut')} r={formatMoney(s.cashOut)} />
      <Row l={t('cash.expected')} r={formatMoney(s.expected)} bold />
      {closed && (
        <>
          <Row l={t('cash.counted')} r={formatMoney(s.session.countedAmount)} bold />
          <Row l={t('cash.difference')} r={`${D(s.session.difference).gt(0) ? '+' : ''}${formatMoney(s.session.difference)}`} bold />
        </>
      )}
      {s.session.closingNote && <div className="mt-1">{s.session.closingNote}</div>}
      {hr}
      <div className="mt-6 flex justify-between gap-4 text-[10px]">
        <div className="flex-1 border-t border-black pt-1 text-center">{t('cash.cashierSignature')}</div>
        <div className="flex-1 border-t border-black pt-1 text-center">{t('cash.managerSignature')}</div>
      </div>
    </div>
  );
}
