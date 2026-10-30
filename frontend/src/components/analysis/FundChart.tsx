import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { plColor, type Formatters } from './format';
import { RANGE_KEYS, anchoredLine, periodStats, sliceRange, unitPrice, type RangeKey } from './performance';
import type { PerformancePoint } from './types';

const MODES = ['unit', 'value', 'pl'] as const;
type Mode = (typeof MODES)[number];

interface ChartRow {
  date: string;
  value: number;
  /** invested (value mode) */
  secondary: number | null;
  /** unit mode: comparison lines rebased to the unit price, and their change since the range start, % */
  comparisons: Partial<Record<ComparisonKey, { value: number; pct: number }>>;
  /** unit mode, Overview: each portfolio's own unit price on the combined line (see anchoredLine) */
  portfolios: Record<string, { value: number; pct: number } | null>;
  /** daily unit price change, % */
  daily: number;
  /** unit price change since the range start, % */
  sinceStart: number;
  point: PerformancePoint;
}

const PRIMARY = 'hsl(var(--primary))';
const MUTED = 'hsl(var(--muted-foreground))';
const GAIN = 'hsl(var(--gain))';
const LOSS = 'hsl(var(--loss))';
const GOLD = 'var(--series-gold)';
const USD = 'var(--series-usd)';

/** Lines drawn next to the unit price, all started from the same point. */
const COMPARISONS = [
  { key: 'benchmark', field: 'benchmark_close', color: MUTED },
  { key: 'gold', field: 'gold_close', color: GOLD },
  { key: 'usd', field: 'usd_close', color: USD },
] as const;
type ComparisonKey = (typeof COMPARISONS)[number]['key'];

/** A single portfolio drawn on the Overview chart; off until ticked. */
export interface PortfolioLine {
  key: string;
  label: string;
  color: string;
  /** The portfolio's cumulative time-weighted return, %, by date. */
  twrByDate: Map<string, number>;
}
// Stable default, so the memoized lines are not rebuilt on every render.
const NO_PORTFOLIO_LINES: PortfolioLine[] = [];

/**
 * The portfolio drawn like a fund chart: its unit price over time, with
 * BIST 100, gold and the dollar on the same footing; plus value and P/L views.
 *
 * ``portfolioLines`` (Overview): each included portfolio as a solid line
 * that can be ticked on, from its first day or the range start.
 *
 * ``hideAmounts`` (Explore): unit price only — no value / P/L views, no
 * TL in the tooltip. Explore also shows the selected period's return and
 * largest drop under the chart (``periodSummary``); portfolio pages have
 * those in their overview and highlights instead.
 */
export function FundChart({
  points,
  fmt,
  range,
  onRangeChange,
  hideAmounts = false,
  periodSummary = false,
  portfolioLines = NO_PORTFOLIO_LINES,
}: {
  points: PerformancePoint[];
  fmt: Formatters;
  /** Selected period; shared with the returns table. */
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  hideAmounts?: boolean;
  periodSummary?: boolean;
  portfolioLines?: PortfolioLine[];
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('unit');
  const [shown, setShown] = useState<Record<ComparisonKey, boolean>>({ benchmark: true, gold: true, usd: true });
  const [shownPortfolios, setShownPortfolios] = useState<Record<string, boolean>>({});

  const slice = useMemo(() => sliceRange(points, range), [points, range]);
  const stats = useMemo(() => periodStats(slice), [slice]);
  const available = COMPARISONS.filter((c) => slice.points.some((p) => p[c.field] != null));
  const drawn = available.filter((c) => shown[c.key]);
  const drawnPortfolios = portfolioLines.filter((l) => shownPortfolios[l.key]);
  const anchored = useMemo(
    () => new Map(portfolioLines.map((l) => [l.key, anchoredLine(slice, l.twrByDate)])),
    [portfolioLines, slice]
  );

  const rows: ChartRow[] = useMemo(() => {
    const startUnit = slice.baseline ? unitPrice(slice.baseline) : 1;
    // Each line starts at the baseline's close, else its first known one.
    const bases = COMPARISONS.map(
      (c) => slice.baseline?.[c.field] ?? slice.points.find((p) => p[c.field] != null)?.[c.field] ?? null
    );
    return slice.points.map((p, i) => {
      const prev = i > 0 ? slice.points[i - 1] : slice.baseline;
      const unit = unitPrice(p);
      return {
        date: p.date,
        value: mode === 'unit' ? unit : mode === 'value' ? p.total_value : p.total_pl,
        secondary: mode === 'value' ? p.invested : null,
        comparisons: Object.fromEntries(
          COMPARISONS.flatMap((c, j) => {
            const base = bases[j];
            const close = p[c.field];
            return base && close != null ? [[c.key, { value: (close / base) * startUnit, pct: (close / base - 1) * 100 }]] : [];
          })
        ),
        portfolios: Object.fromEntries([...anchored].map(([key, line]) => [key, line[i]])),
        daily: (unit / (prev ? unitPrice(prev) : 1) - 1) * 100,
        sinceStart: (unit / startUnit - 1) * 100,
        point: p,
      };
    });
  }, [slice, mode, anchored]);

  const { maxRow, minRow } = useMemo(() => {
    let maxRow = rows[0];
    let minRow = rows[0];
    for (const r of rows) {
      if (r.value > maxRow.value) maxRow = r;
      if (r.value < minRow.value) minRow = r;
    }
    return { maxRow, minRow };
  }, [rows]);

  // P/L view: green above zero, red below — split the fill at zero.
  const zeroOffset =
    !maxRow || minRow.value >= 0 ? 1 : maxRow.value <= 0 ? 0 : maxRow.value / (maxRow.value - minRow.value);

  const drawdown = stats?.maxDrawdown ?? null;
  const drawdownStart =
    drawdown && drawdown.peakDate && drawdown.peakDate >= (rows[0]?.date ?? '') ? drawdown.peakDate : rows[0]?.date;

  const formatAxis = (v: number) => (mode === 'unit' ? fmt.unit(v) : fmt.compactMoney(v));

  return (
    <Panel className="p-4 md:p-6 mb-6" aria-labelledby="fund-chart-title">
      <PanelHeader
        id="fund-chart-title"
        icon={LineChartIcon}
        title={t(`analyze.chart.titles.${mode}`)}
        className="mb-4"
        actions={
          <Segmented
            label={t('analyze.chart.rangeLabel')}
            options={RANGE_KEYS.map((key) => ({ key, label: t(`analyze.performance.ranges.${key}`) }))}
            value={range}
            onChange={onRangeChange}
          />
        }
      />

      {!stats ? (
        <div
          className="rounded-lg border-2 border-dashed p-10 text-center"
          style={{ borderColor: 'hsl(var(--border))', color: MUTED }}
        >
          {t('analyze.chart.noData')}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            {!hideAmounts && (
              <Segmented
                size="sm"
                label={t('analyze.chart.modeLabel')}
                options={MODES.map((key) => ({ key, label: t(`analyze.chart.modes.${key}`) }))}
                value={mode}
                onChange={setMode}
              />
            )}
            {mode === 'unit' && available.length > 0 && (
              <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: MUTED }}>
                <legend className="sr-only">{t('analyze.chart.compareLabel')}</legend>
                <span aria-hidden="true">{t('analyze.chart.compareLabel')}:</span>
                {available.map((c) => (
                  <label key={c.key} className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={shown[c.key]}
                      onChange={(e) => setShown((s) => ({ ...s, [c.key]: e.target.checked }))}
                      className="h-4 w-4"
                      style={{ accentColor: c.color }}
                    />
                    {t(`analyze.chart.comparisons.${c.key}`)}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
          {mode === 'unit' && portfolioLines.length > 0 && (
            <fieldset className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm mb-3" style={{ color: MUTED }}>
              <legend className="sr-only">{t('analyze.chart.portfoliosLabel')}</legend>
              <span aria-hidden="true">{t('analyze.chart.portfoliosLabel')}:</span>
              {portfolioLines.map((l) => (
                <label key={l.key} className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!shownPortfolios[l.key]}
                    onChange={(e) => setShownPortfolios((s) => ({ ...s, [l.key]: e.target.checked }))}
                    className="h-4 w-4"
                    style={{ accentColor: l.color }}
                  />
                  {l.label}
                </label>
              ))}
            </fieldset>
          )}

          {mode === 'unit' && (
            <Legend
              items={[
                { color: PRIMARY, label: t('analyze.chart.portfolioUnit') },
                ...drawn.map((c) => ({ color: c.color, label: t(`analyze.chart.comparisonLines.${c.key}`), dashed: true })),
                ...drawnPortfolios.map((l) => ({ color: l.color, label: l.label })),
              ]}
            />
          )}
          {mode === 'value' && (
            <Legend
              items={[
                { color: PRIMARY, label: t('analyze.performance.totalValue') },
                { color: MUTED, label: t('analyze.performance.invested'), dashed: true },
              ]}
            />
          )}

          <div className="h-[300px] md:h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                <defs>
                  <linearGradient id="unitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor={PRIMARY} stopOpacity={0.22} />
                    <stop offset={1} stopColor={PRIMARY} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="plFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={0} stopColor={GAIN} stopOpacity={0.25} />
                    <stop offset={zeroOffset} stopColor={GAIN} stopOpacity={0.04} />
                    <stop offset={zeroOffset} stopColor={LOSS} stopOpacity={0.04} />
                    <stop offset={1} stopColor={LOSS} stopOpacity={0.25} />
                  </linearGradient>
                  <linearGradient id="plStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={zeroOffset} stopColor={GAIN} />
                    <stop offset={zeroOffset} stopColor={LOSS} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  minTickGap={40}
                  tickFormatter={(v) => fmt.shortDate(String(v))}
                  tick={{ fontSize: 12, fill: MUTED }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                  width={72}
                  tickFormatter={(v) => formatAxis(Number(v))}
                  tick={{ fontSize: 12, fill: MUTED }}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                />

                {mode === 'pl' && <ReferenceLine y={0} stroke={MUTED} strokeOpacity={0.6} />}
                {mode === 'unit' && <ReferenceLine y={1} stroke={MUTED} strokeOpacity={0.35} strokeDasharray="2 4" />}

                {mode === 'unit' && drawdown && drawdownStart && (
                  <ReferenceArea x1={drawdownStart} x2={drawdown.troughDate} fill={LOSS} fillOpacity={0.045} ifOverflow="hidden" />
                )}

                {mode === 'unit' &&
                  drawn.map((c) => (
                    <Line
                      key={c.key}
                      type="monotone"
                      dataKey={(row: ChartRow) => row.comparisons[c.key]?.value ?? null}
                      stroke={c.color}
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                {mode === 'unit' &&
                  drawnPortfolios.map((l) => (
                    <Line
                      key={l.key}
                      type="monotone"
                      dataKey={(row: ChartRow) => row.portfolios[l.key]?.value ?? null}
                      stroke={l.color}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                {mode === 'value' && (
                  <Line
                    type="stepAfter"
                    dataKey="secondary"
                    stroke={MUTED}
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={mode === 'pl' ? 'url(#plStroke)' : PRIMARY}
                  strokeWidth={2}
                  fill={mode === 'pl' ? 'url(#plFill)' : 'url(#unitFill)'}
                  isAnimationActive={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                />

                {maxRow && (
                  <ReferenceDot x={maxRow.date} y={maxRow.value} r={5} fill={GAIN} stroke="hsl(var(--card))" strokeWidth={2} />
                )}
                {minRow && minRow !== maxRow && (
                  <ReferenceDot x={minRow.date} y={minRow.value} r={5} fill={LOSS} stroke="hsl(var(--card))" strokeWidth={2} />
                )}

                <Tooltip
                  cursor={{ stroke: MUTED, strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    const row = active ? (payload?.[0]?.payload as ChartRow | undefined) : undefined;
                    if (!row) return null;
                    const p = row.point;
                    return (
                      <div
                        className="rounded-lg border px-2.5 py-2 text-xs shadow-lg min-w-[184px] backdrop-blur-sm"
                        style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--popover) / 0.92)' }}
                      >
                        <p className="text-[11px] font-medium" style={{ color: MUTED }}>
                          {fmt.date(p.date)}
                        </p>
                        <p className="flex items-baseline justify-between gap-3 mt-0.5">
                          <span className="text-sm font-semibold tabular-nums">{fmt.unit(unitPrice(p))}</span>
                          <span className="tabular-nums font-medium" style={{ color: plColor(row.daily) }}>
                            {fmt.pct(row.daily)}
                            <span className="ml-1 font-normal" style={{ color: MUTED }}>
                              {t('analyze.chart.dailyShort')}
                            </span>
                          </span>
                        </p>

                        <p className="mt-2 mb-0.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>
                          {t('analyze.chart.sinceRangeStart')}
                        </p>
                        <TooltipLine dot={PRIMARY} label={t('analyze.performance.portfolio')} value={fmt.pct(row.sinceStart)} color={plColor(row.sinceStart)} strong />
                        {mode === 'unit' &&
                          drawn.map((c) => {
                            const cmp = row.comparisons[c.key];
                            return (
                              cmp && (
                                <TooltipLine
                                  key={c.key}
                                  dot={c.color}
                                  label={t(`analyze.chart.comparisons.${c.key}`)}
                                  value={fmt.pct(cmp.pct)}
                                  color={plColor(cmp.pct)}
                                />
                              )
                            );
                          })}
                        {mode === 'unit' &&
                          drawnPortfolios.map((l) => {
                            const own = row.portfolios[l.key];
                            return (
                              own && (
                                <TooltipLine
                                  key={l.key}
                                  dot={l.color}
                                  label={l.label}
                                  value={fmt.pct(own.pct)}
                                  color={plColor(own.pct)}
                                />
                              )
                            );
                          })}

                        {!hideAmounts && (
                          <>
                            <div className="my-1.5 border-t" style={{ borderColor: 'hsl(var(--border))' }} />
                            <TooltipLine label={t('analyze.performance.totalValue')} value={fmt.money(p.total_value)} />
                            <TooltipLine label={t('analyze.performance.invested')} value={fmt.money(p.invested)} />
                            <TooltipLine label={t('analyze.performance.totalPl')} value={fmt.signedMoney(p.total_pl)} color={plColor(p.total_pl)} strong />
                            <p className="text-right tabular-nums text-[11px]" style={{ color: plColor(p.total_pl) }}>
                              {fmt.pct(p.pl_pct)}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs mt-2" style={{ color: MUTED }}>
            {t(`analyze.chart.hints.${mode}`)}
            {mode === 'unit' && drawnPortfolios.length > 0 && <> {t('analyze.chart.portfoliosHint')}</>}
          </p>

          {periodSummary && (
            <div className="grid gap-3 sm:grid-cols-2 mt-5">
              <StatCard
                label={t('analyze.performance.return')}
                value={fmt.pct(stats.returnPct)}
                color={plColor(stats.returnPct)}
                hint={t('analyze.performance.returnHint')}
                lines={[
                  stats.benchmarkReturnPct != null &&
                    t('analyze.performance.vsBenchmark', {
                      value: fmt.pct(stats.benchmarkReturnPct),
                      diff: fmt.points(stats.returnPct - stats.benchmarkReturnPct),
                    }),
                ]}
              />
              <StatCard
                label={t('analyze.performance.maxDrawdown')}
                value={drawdown ? fmt.pct(drawdown.pct) : '—'}
                color={drawdown ? LOSS : MUTED}
                hint={t('analyze.performance.drawdownHint')}
                lines={
                  drawdown
                    ? [
                        t('analyze.performance.drawdownSpan', {
                          from: drawdown.peakDate ? fmt.date(drawdown.peakDate) : t('analyze.performance.start'),
                          to: fmt.date(drawdown.troughDate),
                        }),
                        drawdown.recoveryDate
                          ? t('analyze.performance.recovered', { date: fmt.date(drawdown.recoveryDate) })
                          : t('analyze.performance.notRecovered', { value: fmt.pct(stats.currentDrawdownPct) }),
                      ]
                    : [t('analyze.performance.noDrawdown')]
                }
              />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function Legend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-4 mb-2 text-xs" style={{ color: MUTED }}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true">
            <line
              x1="0"
              y1="3"
              x2="18"
              y2="3"
              stroke={item.color}
              strokeWidth="2"
              strokeDasharray={item.dashed ? '4 3' : undefined}
            />
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function StatCard({
  label,
  value,
  color,
  lines,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  lines: (ReactNode | false | undefined)[];
  hint?: string;
}) {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-1" style={{ borderColor: 'hsl(var(--border))' }} title={hint}>
      <span className="text-sm" style={{ color: MUTED }}>
        {label}
      </span>
      <span className="text-xl font-bold tabular-nums" style={{ color: color ?? 'hsl(var(--foreground))' }}>
        {value}
      </span>
      {lines.filter(Boolean).map((line, i) => (
        <span key={i} className="text-xs" style={{ color: MUTED }}>
          {line}
        </span>
      ))}
    </div>
  );
}

function TooltipLine({
  label,
  value,
  color,
  strong,
  dot,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
  /** Series color: a marker tying the row to its line on the chart. */
  dot?: string;
}) {
  return (
    <p className="flex items-center justify-between gap-4 leading-5">
      <span className="inline-flex items-center gap-1.5" style={{ color: dot ? 'hsl(var(--foreground))' : MUTED }}>
        {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} aria-hidden="true" />}
        {label}
      </span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : 'font-medium'}`} style={{ color }}>
        {value}
      </span>
    </p>
  );
}
