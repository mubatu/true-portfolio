import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { InfoNote, Panel, PanelHeader } from '@/components/ui/Panel';
import { PHONE_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
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

const Y_AXIS_WIDTH = 72;
const PHONE_Y_AXIS_WIDTH = 60;
const X_AXIS_HEIGHT = 30;
const CHART_MARGIN = { top: 12, right: 12, left: 0, bottom: 4 };
/** Phones: room per day, so the chart is wider than the screen and scrolls sideways. */
const PHONE_PX_PER_POINT = 3;
/** Phones: the tooltip's width, to keep it on screen (see phoneTooltipPosition). */
const PHONE_TOOLTIP_WIDTH = 196;

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
 * TL in the tooltip.
 */
export function FundChart({
  points,
  fmt,
  range,
  onRangeChange,
  hideAmounts = false,
  portfolioLines = NO_PORTFOLIO_LINES,
}: {
  points: PerformancePoint[];
  fmt: Formatters;
  /** Selected period; shared with the returns table. */
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  hideAmounts?: boolean;
  portfolioLines?: PortfolioLine[];
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('unit');
  const [shown, setShown] = useState<Record<ComparisonKey, boolean>>({ benchmark: true, gold: true, usd: true });
  const [shownPortfolios, setShownPortfolios] = useState<Record<string, boolean>>({});
  const isPhone = useMediaQuery(PHONE_QUERY);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Phones: where the tooltip goes (see onPhoneMouseMove).
  const [phoneTooltipX, setPhoneTooltipX] = useState(0);

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

  // Phones: open the scrolling chart at its latest date.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [isPhone, rows.length, mode]);

  // The chart is wider than the screen, so recharts would place the tooltip
  // off screen: pin it to the top corner of the visible part, away from the finger.
  const onPhoneMouseMove = (state: { activeCoordinate?: { x: number } }) => {
    const el = scrollRef.current;
    if (!el || !state.activeCoordinate) return;
    const onLeft = state.activeCoordinate.x - el.scrollLeft < el.clientWidth / 2;
    const x = onLeft ? Math.max(el.scrollLeft, el.scrollLeft + el.clientWidth - PHONE_TOOLTIP_WIDTH) : el.scrollLeft;
    if (x !== phoneTooltipX) setPhoneTooltipX(x);
  };

  // The comparison lines, the value line and its area. ``ghost`` copies
  // draw nothing: they give the separate phone Y axis the same domain.
  const renderSeries = (ghost: boolean) => (
    <>
      {mode === 'unit' &&
        drawn.map((c) => (
          <Line
            key={c.key}
            type="monotone"
            dataKey={(row: ChartRow) => row.comparisons[c.key]?.value ?? null}
            stroke={ghost ? 'none' : c.color}
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
            stroke={ghost ? 'none' : l.color}
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
          stroke={ghost ? 'none' : MUTED}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          dot={false}
          isAnimationActive={false}
        />
      )}
      <Area
        type="monotone"
        dataKey="value"
        stroke={ghost ? 'none' : mode === 'pl' ? 'url(#plStroke)' : PRIMARY}
        strokeWidth={2}
        fill={ghost ? 'none' : mode === 'pl' ? 'url(#plFill)' : 'url(#unitFill)'}
        isAnimationActive={false}
        activeDot={ghost ? false : { r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
      />
    </>
  );

  const renderYAxis = (hide: boolean, width = Y_AXIS_WIDTH) => (
    <YAxis
      hide={hide}
      width={width}
      tickFormatter={(v) => formatAxis(Number(v))}
      tick={{ fontSize: 12, fill: MUTED }}
      tickLine={false}
      axisLine={false}
      domain={['auto', 'auto']}
    />
  );

  // ``split`` (phones): no Y axis of its own (it sits beside the scrolling
  // chart) and the tooltip stays inside the visible part.
  const renderChart = (split: boolean) => (
    <ComposedChart data={rows} margin={CHART_MARGIN} onMouseMove={split ? onPhoneMouseMove : undefined}>
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
        height={X_AXIS_HEIGHT}
        minTickGap={40}
        tickFormatter={(v) => fmt.shortDate(String(v))}
        tick={{ fontSize: 12, fill: MUTED }}
        tickLine={false}
        axisLine={{ stroke: 'hsl(var(--border))' }}
      />
      {renderYAxis(split)}

      {mode === 'pl' && <ReferenceLine y={0} stroke={MUTED} strokeOpacity={0.6} />}
      {mode === 'unit' && <ReferenceLine y={1} stroke={MUTED} strokeOpacity={0.35} strokeDasharray="2 4" />}

      {mode === 'unit' && drawdown && drawdownStart && (
        <ReferenceArea x1={drawdownStart} x2={drawdown.troughDate} fill={LOSS} fillOpacity={0.045} ifOverflow="hidden" />
      )}

      {renderSeries(false)}

      {maxRow && (
        <ReferenceDot x={maxRow.date} y={maxRow.value} r={5} fill={GAIN} stroke="hsl(var(--card))" strokeWidth={2} />
      )}
      {minRow && minRow !== maxRow && (
        <ReferenceDot x={minRow.date} y={minRow.value} r={5} fill={LOSS} stroke="hsl(var(--card))" strokeWidth={2} />
      )}

      <Tooltip
        cursor={{ stroke: MUTED, strokeDasharray: '3 3' }}
        position={split ? { x: phoneTooltipX, y: 0 } : undefined}
        isAnimationActive={!split}
        content={({ active, payload }) => {
          const row = active ? (payload?.[0]?.payload as ChartRow | undefined) : undefined;
          if (!row) return null;
          const p = row.point;
          return (
            <div
              className="rounded-lg border px-2.5 py-2 text-xs shadow-lg min-w-[184px] max-sm:w-[196px] max-sm:min-w-0 backdrop-blur-sm"
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
  );

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
              // Phones: the tick boxes above already carry the line colors.
              className={drawnPortfolios.length === 0 ? 'max-sm:hidden' : undefined}
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

          {isPhone ? (
            // Phones: a fixed Y axis beside a chart that scrolls sideways,
            // opened at its latest date.
            <div className="flex h-[300px]">
              <div className="h-full shrink-0" style={{ width: PHONE_Y_AXIS_WIDTH + 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows} margin={{ ...CHART_MARGIN, right: 0 }}>
                    <XAxis dataKey="date" height={X_AXIS_HEIGHT} tick={false} tickLine={false} axisLine={false} />
                    {renderYAxis(false, PHONE_Y_AXIS_WIDTH)}
                    {renderSeries(true)}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div ref={scrollRef} className="h-full min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
                <div className="h-full" style={{ width: rows.length * PHONE_PX_PER_POINT, minWidth: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    {renderChart(true)}
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[300px] md:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                {renderChart(false)}
              </ResponsiveContainer>
            </div>
          )}

          <InfoNote className="mt-2">
            {t(`analyze.chart.hints.${mode}`)}
            {mode === 'unit' && drawnPortfolios.length > 0 && <> {t('analyze.chart.portfoliosHint')}</>}
          </InfoNote>

        </>
      )}
    </Panel>
  );
}

function Legend({ items, className }: { items: { color: string; label: string; dashed?: boolean }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-4 mb-2 text-xs', className)} style={{ color: MUTED }}>
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
