import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Briefcase } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { plColor, type Formatters } from '@/components/analysis/format';
import { CardLines, PlCell, WeightBar } from '@/components/analysis/PositionsTable';
import {
  CARD_CLASS,
  CARD_FOOT_CLASS,
  FOOT_CORNER_STYLE,
  FOOT_ROW_CLASS,
  HEAD_BG,
  HEAD_CELL_CLASS,
  TABLE_SCROLL_CLASS,
} from '@/components/analysis/tableStyles';
import { PHONE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import type { AnalysisTotals } from '@/components/analysis/types';
import type { PortfolioRow } from './combine';

const MUTED = 'hsl(var(--muted-foreground))';
const CELL = 'px-3 py-3 text-right tabular-nums whitespace-nowrap';
const STICKY_BG = { backgroundColor: 'hsl(var(--card))' };

/**
 * Per-portfolio P/L, the Overview's counterpart of the per-stock table:
 * each portfolio's size, share, money put in and P/L split, plus its own
 * time-weighted return. Rows open the portfolio's analysis. Phones get one
 * card per portfolio.
 */
export function PortfolioBreakdownTable({
  rows,
  totals,
  fmt,
}: {
  rows: PortfolioRow[];
  totals: AnalysisTotals;
  fmt: Formatters;
}) {
  const { t } = useTranslation();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const head: [string, 'left'?][] = [
    [t('overview.table.portfolio'), 'left'],
    [t('analyze.fund.size')],
    [t('analyze.positions.weight')],
    [t('analyze.totalInvested')],
    [t('analyze.table.unrealized')],
    [t('analyze.table.realized')],
    [t('analyze.positions.dividends')],
    [t('analyze.table.total')],
    [t('analyze.positions.totalPct')],
    [t('overview.table.unitReturn')],
  ];

  return (
    <Panel className="mb-6 overflow-hidden" aria-labelledby="portfolio-breakdown-title">
      <PanelHeader
        id="portfolio-breakdown-title"
        icon={Briefcase}
        title={t('overview.table.title')}
        description={t('overview.table.hint')}
        className="p-4 md:p-6"
      />
      {isPhone ? (
        <div className="border-t">
          <ul>
            {rows.map((r) => (
              <li key={r.id} className={CARD_CLASS} style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-baseline justify-between gap-3">
                  <Link to={`/portfolio/${r.slug}/analyze`} className="min-w-0 font-semibold hover:underline">
                    {r.name}
                  </Link>
                  <span className="shrink-0 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: plColor(r.total_pl) }}>
                    {fmt.signedMoney(r.total_pl)}
                    <span className="ml-2 text-xs">{fmt.pct(r.total_pl_pct)}</span>
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                  <span className="rounded border px-1.5 py-px text-[10px] font-semibold">{r.market}</span>
                  {fmt.money(r.value)} · {fmt.share(r.weight_pct)}
                </p>
                <CardLines
                  lines={[
                    [t('analyze.totalInvested'), fmt.money(r.invested)],
                    ...[
                      [t('analyze.positions.short.unrealized'), r.unrealized_pl] as const,
                      [t('analyze.positions.short.realized'), r.realized_pl] as const,
                      [t('analyze.positions.dividends'), r.dividend_income] as const,
                    ]
                      .filter(([, value]) => Math.abs(value) >= 0.005)
                      .map(([label, value]) => [label, fmt.signedMoney(value), plColor(value)] as const),
                    [
                      t('overview.table.unitReturn'),
                      r.twr_pct != null ? fmt.pct(r.twr_pct) : '—',
                      r.twr_pct != null ? plColor(r.twr_pct) : MUTED,
                    ],
                  ]}
                />
              </li>
            ))}
          </ul>
          <div className={CARD_FOOT_CLASS}>
            <span>{t('analyze.table.sum')}</span>
            <span className="text-right tabular-nums" style={{ color: plColor(totals.total_pl) }}>
              {fmt.signedMoney(totals.total_pl)}
              {totals.total_invested > 0 && <span className="ml-2 text-xs">{fmt.pct(totals.total_pl_pct)}</span>}
            </span>
          </div>
        </div>
      ) : (
        <div className="border-t">
          <div className={TABLE_SCROLL_CLASS}>
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr>
                  {head.map(([label, align], i) => (
                    <th
                      key={i}
                      scope="col"
                      className={`${HEAD_CELL_CLASS} ${align === 'left' ? 'left-0 text-left' : 'text-right'}`}
                      // Corner cell: above both the header row and the sticky column.
                      style={{ ...HEAD_BG, color: MUTED, zIndex: i === 0 ? 30 : undefined }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t group" style={{ borderColor: 'hsl(var(--border))' }}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 px-3 py-3 text-left font-semibold whitespace-nowrap group-hover:bg-muted/50"
                      style={STICKY_BG}
                    >
                      <Link to={`/portfolio/${r.slug}/analyze`} className="inline-flex items-center gap-2 hover:underline">
                        {r.name}
                        <span className="rounded border px-1.5 py-px text-[10px] font-semibold" style={{ color: MUTED }}>
                          {r.market}
                        </span>
                      </Link>
                    </th>
                    <td className={CELL}>{fmt.money(r.value)}</td>
                    <td className="px-3 py-3 text-right">
                      <WeightBar pct={r.weight_pct} label={fmt.share(r.weight_pct)} />
                    </td>
                    <td className={CELL}>{fmt.money(r.invested)}</td>
                    <PlCell value={r.unrealized_pl} fmt={fmt} />
                    <PlCell value={r.realized_pl} fmt={fmt} />
                    <PlCell value={r.dividend_income} fmt={fmt} />
                    <PlCell value={r.total_pl} fmt={fmt} strong />
                    <td className={`${CELL} font-semibold`} style={{ color: plColor(r.total_pl_pct) }}>
                      {fmt.pct(r.total_pl_pct)}
                    </td>
                    <td className={CELL} style={{ color: r.twr_pct != null ? plColor(r.twr_pct) : MUTED }}>
                      {r.twr_pct != null ? fmt.pct(r.twr_pct) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={FOOT_ROW_CLASS}>
                  <th scope="row" className="left-0 px-3 py-3 text-left" style={FOOT_CORNER_STYLE}>
                    {t('analyze.table.sum')}
                  </th>
                  <td className={CELL}>{fmt.money(totals.portfolio_value + totals.in_the_safe)}</td>
                  <td />
                  <td className={CELL}>{fmt.money(totals.total_invested)}</td>
                  <PlCell value={totals.unrealized_pl} fmt={fmt} />
                  <PlCell value={totals.realized_pl} fmt={fmt} />
                  <PlCell value={totals.dividend_income} fmt={fmt} />
                  <PlCell value={totals.total_pl} fmt={fmt} strong />
                  <td className={CELL} style={{ color: plColor(totals.total_pl) }}>
                    {totals.total_invested > 0 ? fmt.pct(totals.total_pl_pct) : '—'}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}
