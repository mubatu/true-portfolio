import { useTranslation } from 'react-i18next';
import { plColor, type Formatters } from './format';
import {
  HEAD_BG,
  HEAD_CELL_CLASS,
  TABLE_CARD_CLASS,
  TABLE_CARD_STYLE,
  TABLE_SCROLL_CLASS,
} from './tableStyles';
import type { DividendSummary } from './types';

const MUTED = 'hsl(var(--muted-foreground))';
const CELL = 'px-3 py-3 text-right tabular-nums whitespace-nowrap';

/** Dividends credited to the safe, newest first; styled like the per-stock P/L table. */
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
    <section className="mb-6" aria-labelledby="dividends-title">
      <div className="mb-3">
        <h2 id="dividends-title" className="text-lg font-semibold">
          {t('analyze.dividends')}
        </h2>
        <p className="text-sm" style={{ color: MUTED }}>
          {t('analyze.dividendsHint')}
        </p>
      </div>

      {dividends.receipts.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'hsl(var(--border))', color: MUTED }}
        >
          {t('analyze.noDividends')}
        </div>
      ) : (
        <div className={TABLE_CARD_CLASS} style={TABLE_CARD_STYLE}>
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
                <tr
                  className="border-t-2 font-semibold"
                  style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted) / 0.3)' }}
                >
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
    </section>
  );
}
