import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { plColor, type Formatters } from './format';
import {
  annualizedVolatility,
  dailyExtremes,
  periodReturns,
  sameMoneyIn,
  type ComparisonField,
  type PeriodReturn,
  type RangeKey,
} from './performance';
import type { PerformancePoint } from './types';

/** The chart's comparison lines, in its colors. */
const COMPARISON_ROWS: { key: string; field: ComparisonField; pct: keyof PeriodReturn; color: string }[] = [
  { key: 'benchmark', field: 'benchmark_close', pct: 'benchmarkPct', color: 'hsl(var(--muted-foreground))' },
  { key: 'gold', field: 'gold_close', pct: 'goldPct', color: 'var(--series-gold)' },
  { key: 'usd', field: 'usd_close', pct: 'usdPct', color: 'var(--series-usd)' },
];

const MUTED = 'hsl(var(--muted-foreground))';
const PORTFOLIO_COLOR = 'hsl(var(--primary))';

/**
 * Portfolio vs. BIST 100, gold and the dollar, two ways: the unit price
 * change over the period picked on the chart (performance, free of money
 * flows), and the TL result since the start had the same money gone into
 * each of them on the same days instead of into the stocks.
 */
export function ReturnsTable({
  points,
  fmt,
  range,
  hideAmounts = false,
  dayExtremes = false,
}: {
  points: PerformancePoint[];
  fmt: Formatters;
  range: RangeKey;
  /** Public view: returns only, without the TL "same money" column. */
  hideAmounts?: boolean;
  /** Best and worst day under the table, where no highlights show them (Explore). */
  dayExtremes?: boolean;
}) {
  const { t } = useTranslation();
  const period = useMemo(() => periodReturns(points).find((r) => r.range === range) ?? null, [points, range]);
  const volatility = useMemo(() => annualizedVolatility(points), [points]);
  const extremes = useMemo(() => (dayExtremes ? dailyExtremes(points) : null), [points, dayExtremes]);
  const comparisons = useMemo(
    () =>
      COMPARISON_ROWS.map((c) => ({
        ...c,
        returnPct: (period?.[c.pct] as number | null | undefined) ?? null,
        sameMoney: sameMoneyIn(points, c.field),
      })).filter((c) => c.returnPct != null || c.sameMoney != null),
    [points, period]
  );

  const last = points[points.length - 1];
  if (!last) return null;

  // One scale for every bar in the column: the largest move fills half the track.
  const maxAbs = Math.max(
    0,
    ...[period?.returnPct ?? null, ...comparisons.map((c) => c.returnPct)].map((v) => (v == null ? 0 : Math.abs(v)))
  );

  const pctCell = (v: number | null, color: string) =>
    v == null ? (
      <span style={{ color: MUTED }}>—</span>
    ) : (
      <span className="inline-flex items-center justify-end gap-3">
        <ReturnBar value={v} max={maxAbs} color={color} />
        <span className="font-semibold tabular-nums min-w-[4.5rem] text-right" style={{ color: plColor(v) }}>
          {fmt.pct(v)}
        </span>
      </span>
    );

  const plCell = (pl: number | null, pct: number | null) =>
    pl == null ? (
      <span style={{ color: MUTED }}>—</span>
    ) : (
      <span className="inline-flex flex-col items-end tabular-nums">
        <span className="font-semibold" style={{ color: plColor(pl) }}>
          {fmt.signedMoney(pl)}
        </span>
        {pct != null && (
          <span className="text-xs" style={{ color: plColor(pl) }}>
            {fmt.pct(pct)}
          </span>
        )}
      </span>
    );

  return (
    <Panel className="p-4 md:p-6" aria-labelledby="returns-title">
      <PanelHeader
        id="returns-title"
        icon={CalendarRange}
        title={t('analyze.returns.title')}
        description={t(hideAmounts ? 'explore.returnsHint' : 'analyze.returns.hint')}
        className="mb-4"
      />

      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
        <table className={`w-full text-sm ${hideAmounts ? '' : 'min-w-[480px]'}`}>
          <thead>
            <tr style={{ color: MUTED }}>
              <th scope="col" className="text-left font-medium py-2 pr-4" />
              <th scope="col" className="text-right font-medium py-2 px-2 align-bottom">
                {t('analyze.returns.returnIn', { period: t(`analyze.returns.periods.${range}`) })}
              </th>
              {!hideAmounts && (
                <th scope="col" className="text-right font-medium py-2 pl-2 align-bottom" title={t('analyze.returns.sameMoneyHint')}>
                  {t('analyze.returns.sameMoney')}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <th scope="row" className="text-left font-semibold py-3 pr-4">
                {t('analyze.performance.portfolio')}
              </th>
              <td className="text-right py-3 px-2">{pctCell(period?.returnPct ?? null, PORTFOLIO_COLOR)}</td>
              {!hideAmounts && <td className="text-right py-3 pl-2">{plCell(last.total_pl, last.pl_pct)}</td>}
            </tr>
            {comparisons.map((c) => (
              <tr key={c.key} className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                <th scope="row" className="text-left font-medium py-3 pr-4 whitespace-nowrap" style={{ color: MUTED }}>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
                    {t(`analyze.chart.comparisons.${c.key}`)}
                  </span>
                </th>
                <td className="text-right py-3 px-2">{pctCell(c.returnPct, c.color)}</td>
                {!hideAmounts && (
                  <td className="text-right py-3 pl-2">{plCell(c.sameMoney?.pl ?? null, c.sameMoney?.plPct ?? null)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(volatility != null || extremes) && (
        <dl className="flex flex-wrap gap-x-8 gap-y-2 mt-4 text-sm">
          {volatility != null && (
            <div className="flex gap-2">
              <dt style={{ color: MUTED }} title={t('analyze.returns.volatilityHint')}>
                {t('analyze.returns.volatility')}
              </dt>
              <dd className="font-medium tabular-nums">{fmt.share(volatility)}</dd>
            </div>
          )}
          {extremes && (
            <>
              <div className="flex gap-2">
                <dt style={{ color: MUTED }}>{t('analyze.returns.bestDay')}</dt>
                <dd className="font-medium tabular-nums" style={{ color: plColor(extremes.best.pct) }}>
                  {fmt.pct(extremes.best.pct)}
                  <span className="font-normal ml-1" style={{ color: MUTED }}>
                    ({fmt.date(extremes.best.date)})
                  </span>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt style={{ color: MUTED }}>{t('analyze.returns.worstDay')}</dt>
                <dd className="font-medium tabular-nums" style={{ color: plColor(extremes.worst.pct) }}>
                  {fmt.pct(extremes.worst.pct)}
                  <span className="font-normal ml-1" style={{ color: MUTED }}>
                    ({fmt.date(extremes.worst.date)})
                  </span>
                </dd>
              </div>
            </>
          )}
        </dl>
      )}
    </Panel>
  );
}

/**
 * Diverging bar from a zero line in the middle of the track: right for a
 * gain, left for a loss, in the row's chart color. The number beside it
 * carries the value; the bar is for comparing rows at a glance.
 */
function ReturnBar({ value, max, color }: { value: number; max: number; color: string }) {
  const half = max > 0 ? (Math.abs(value) / max) * 50 : 0;
  const width = value === 0 ? 0 : Math.max(half, 1.5);
  return (
    <span className="relative hidden sm:block h-2 w-32 shrink-0 rounded-full bg-muted" aria-hidden="true">
      <span
        className={`absolute inset-y-0 ${value >= 0 ? 'rounded-r-[4px]' : 'rounded-l-[4px]'}`}
        style={{ backgroundColor: color, width: `${width}%`, left: value >= 0 ? '50%' : `${50 - width}%` }}
      />
      <span className="absolute -inset-y-1 left-1/2 w-px -translate-x-1/2" style={{ backgroundColor: MUTED, opacity: 0.6 }} />
    </span>
  );
}

