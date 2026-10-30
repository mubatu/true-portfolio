import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { plColor, type Formatters } from './format';
import { CARD_CLASS, CARD_FOOT_CLASS, FOOT_ROW_CLASS, HEAD_BG, HEAD_CELL_CLASS, TABLE_SCROLL_CLASS } from './tableStyles';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import type { DividendSummary } from './types';
import { PHONE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';

const MUTED = 'hsl(var(--muted-foreground))';
const CELL = 'px-3 py-3 text-right tabular-nums whitespace-nowrap';

/**
 * Dividends credited to the safe, newest first; styled like the per-stock P/L table.
 * Phones: one card per dividend, net amount on the right.
 */
export function DividendsTable({
  dividends,
  fmt,
  displayTicker,
}: {
  dividends: DividendSummary;
  fmt: Formatters;
  displayTicker: (ticker: string) => string;
}) {
  const { t } = useTranslation();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const head: [string, 'left'?][] = [
    [t('analyze.table.exDate'), 'left'],
    [t('analyze.table.ticker'), 'left'],
    [t('analyze.table.shares')],
    [t('analyze.table.grossPerShare')],
    [t('analyze.table.gross')],
    [t('analyze.table.withholding')],
    [t('analyze.table.net')],
  ];

  return (
    <Panel className="mb-6 overflow-hidden" aria-labelledby="dividends-title">
      <PanelHeader
        id="dividends-title"
        icon={Coins}
        title={t('analyze.dividends')}
        description={t('analyze.dividendsHint')}
        className="p-4 md:p-6"
      />

      {dividends.receipts.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed p-8 mx-4 mb-4 md:mx-6 md:mb-6 text-center text-sm"
          style={{ borderColor: 'hsl(var(--border))', color: MUTED }}
        >
          {t('analyze.noDividends')}
        </div>
      ) : isPhone ? (
        <div className="border-t">
          <ul className={TABLE_SCROLL_CLASS}>
            {dividends.receipts.map((d) => (
              <li key={`${d.ticker}-${d.ex_date}`} className={CARD_CLASS} style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{displayTicker(d.ticker)}</span>
                  <span className="font-semibold tabular-nums whitespace-nowrap" style={{ color: plColor(d.net_amount) }}>
                    {fmt.money(d.net_amount)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                  <span className="tabular-nums whitespace-nowrap">
                    {fmt.date(d.ex_date)} · {fmt.number(d.quantity)} × {fmt.money(d.gross_per_share)}
                  </span>
                  <span className="text-right tabular-nums whitespace-nowrap">
                    {t('analyze.table.gross')} {fmt.money(d.gross_amount)} · {fmt.rate(d.withholding_rate)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className={CARD_FOOT_CLASS}>
            <span>{t('analyze.table.sum')}</span>
            <span className="text-right tabular-nums" style={{ color: plColor(dividends.total_net) }}>
              {fmt.money(dividends.total_net)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t('analyze.table.gross')} {fmt.money(dividends.total_gross)}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <div className="border-t">
          <div className={TABLE_SCROLL_CLASS}>
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  {head.map(([label, align], i) => (
                    <th
                      key={i}
                      scope="col"
                      className={`${HEAD_CELL_CLASS} ${align === 'left' ? 'text-left' : 'text-right'}`}
                      style={{ ...HEAD_BG, color: MUTED }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dividends.receipts.map((d) => (
                  <tr key={`${d.ticker}-${d.ex_date}`} className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                    <td className="px-3 py-3 text-left tabular-nums whitespace-nowrap">{fmt.date(d.ex_date)}</td>
                    <th scope="row" className="px-3 py-3 text-left font-semibold whitespace-nowrap">
                      {displayTicker(d.ticker)}
                    </th>
                    <td className={CELL}>{fmt.number(d.quantity)}</td>
                    <td className={CELL}>{fmt.money(d.gross_per_share)}</td>
                    <td className={CELL}>{fmt.money(d.gross_amount)}</td>
                    <td className={CELL} style={{ color: MUTED }}>
                      {fmt.rate(d.withholding_rate)}
                    </td>
                    <td className={`${CELL} font-semibold`} style={{ color: plColor(d.net_amount) }}>
                      {fmt.money(d.net_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={FOOT_ROW_CLASS}>
                  <th scope="row" colSpan={4} className="px-3 py-3 text-left">
                    {t('analyze.table.sum')}
                  </th>
                  <td className={CELL}>{fmt.money(dividends.total_gross)}</td>
                  <td />
                  <td className={CELL} style={{ color: plColor(dividends.total_net) }}>
                    {fmt.money(dividends.total_net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}
