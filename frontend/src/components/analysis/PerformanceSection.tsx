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
import { plColor, type Formatters } from './format';
import {
  RANGE_KEYS,
  periodStats,
  rebasedPerformance,
  sliceRange,
  type RangeKey,
} from './performance';
import type { PerformancePoint } from './types';

const MODES = ['pl', 'plPct', 'value', 'performance'] as const;
type Mode = (typeof MODES)[number];

interface ChartRow {
  date: string;
  value: number;
  /** invested (value mode) or benchmark % (performance mode) */
  secondary: number | null;
  point: PerformancePoint;
}

const PRIMARY = 'hsl(var(--primary))';
const MUTED = 'hsl(var(--muted-foreground))';
const GAIN = 'hsl(142 76% 36%)';
const LOSS = 'hsl(0 84% 60%)';

export function PerformanceSection({
  points,
  fmt,
}: {
  points: PerformancePoint[];
  fmt: Formatters;
}) {
  const { t } = useTranslation();
  const [range, setRange] = useState<RangeKey>('ALL');
  const [mode, setMode] = useState<Mode>('pl');

  const slice = useMemo(() => sliceRange(points, range), [points, range]);
  const stats = useMemo(() => periodStats(slice), [slice]);

  // Daily return from the time-weighted series (unaffected by new money).
  const dailyReturn = useMemo(() => {
    const byDate = new Map<string, number>();
    points.forEach((p, i) => {
      const prev = i > 0 ? 1 + points[i - 1].twr_pct / 100 : 1;
      byDate.set(p.date, ((1 + p.twr_pct / 100) / prev - 1) * 100);
    });
    return byDate;
  }, [points]);

  const rows: ChartRow[] = useMemo(() => {
    if (mode === 'performance') {
      const rebased = rebasedPerformance(slice);
      return slice.points.map((p, i) => ({
        date: p.date,
        value: rebased[i].portfolioPct,
        secondary: rebased[i].benchmarkPct,
        point: p,
      }));
    }
    return slice.points.map((p) => ({
      date: p.date,
      value: mode === 'pl' ? p.total_pl : mode === 'plPct' ? p.pl_pct : p.total_value,
      secondary: mode === 'value' ? p.invested : null,
      point: p,
    }));
  }, [slice, mode]);

  const isPct = mode === 'plPct' || mode === 'performance';
  const formatAxis = (v: number) => (isPct ? fmt.axisPct(v) : fmt.compactMoney(v));
  const formatValue = (v: number) => (isPct ? fmt.pct(v) : fmt.money(v));

  const { maxRow, minRow } = useMemo(() => {
    let maxRow = rows[0];
    let minRow = rows[0];
    for (const r of rows) {
      if (r.value > maxRow.value) maxRow = r;
      if (r.value < minRow.value) minRow = r;
    }
    return { maxRow, minRow };
  }, [rows]);

  // Green above zero, red below — split the fill at the zero line.
  const zeroOffset = useMemo(() => {
    if (!maxRow || !minRow) return 1;
    if (minRow.value >= 0) return 1;
    if (maxRow.value <= 0) return 0;
    return maxRow.value / (maxRow.value - minRow.value);
  }, [maxRow, minRow]);

  const drawdown = stats?.maxDrawdown ?? null;
  const drawdownStart =
    drawdown && drawdown.peakDate && drawdown.peakDate >= (rows[0]?.date ?? '')
      ? drawdown.peakDate
      : rows[0]?.date;

  return (
    <section
      className="rounded-xl border p-4 md:p-5 mb-8"
      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">{t('analyze.performance.title')}</h2>
        <Segmented
          options={RANGE_KEYS.map((key) => ({ key, label: t(`analyze.performance.ranges.${key}`) }))}
          value={range}
          onChange={setRange}
        />
      </div>

      {!stats ? (
        <EmptyState text={t('analyze.chart.noData')} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
            <StatCard
              label={t('analyze.performance.return')}
              value={fmt.pct(stats.returnPct)}
              color={plColor(stats.returnPct)}
              lines={[
                stats.benchmarkReturnPct != null &&
                  t('analyze.performance.vsBenchmark', {
                    value: fmt.pct(stats.benchmarkReturnPct),
                    diff: fmt.points(stats.returnPct - stats.benchmarkReturnPct),
                  }),
              ]}
              hint={t('analyze.performance.returnHint')}
            />
            <StatCard
              label={t('analyze.performance.plChange')}
              value={fmt.money(stats.plChange)}
              color={plColor(stats.plChange)}
              lines={[
                t('analyze.performance.plNow', {
                  value: fmt.money(slice.points[slice.points.length - 1].total_pl),
                  pct: fmt.pct(slice.points[slice.points.length - 1].pl_pct),
                }),
              ]}
            />
            <StatCard
              label={t('analyze.performance.peakPl')}
              value={fmt.money(stats.peakPl.totalPl)}
              color={plColor(stats.peakPl.totalPl)}
              lines={[
                t('analyze.performance.onDate', {
                  date: fmt.date(stats.peakPl.date),
                  pct: fmt.pct(stats.peakPl.plPct),
                }),
                stats.belowPeakPl < 0
                  ? t('analyze.performance.belowPeak', { value: fmt.money(-stats.belowPeakPl) })
                  : t('analyze.performance.atPeak'),
              ]}
            />
            <StatCard
              label={t('analyze.performance.maxDrawdown')}
              value={drawdown ? fmt.pct(drawdown.pct) : '—'}
              color={drawdown ? LOSS : MUTED}
              lines={
                drawdown
                  ? [
                      t('analyze.performance.drawdownSpan', {
                        from: drawdown.peakDate
                          ? fmt.date(drawdown.peakDate)
                          : t('analyze.performance.start'),
                        to: fmt.date(drawdown.troughDate),
                      }),
                      drawdown.recoveryDate
                        ? t('analyze.performance.recovered', { date: fmt.date(drawdown.recoveryDate) })
                        : t('analyze.performance.notRecovered', {
                            value: fmt.pct(stats.currentDrawdownPct),
                          }),
                    ]
                  : [t('analyze.performance.noDrawdown')]
              }
              hint={t('analyze.performance.drawdownHint')}
            />
          </div>

          <div className="mb-3">
            <Segmented
              options={MODES.map((key) => ({ key, label: t(`analyze.performance.modes.${key}`) }))}
              value={mode}
              onChange={setMode}
            />
          </div>

          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
                <defs>
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
                  minTickGap={32}
                  tickFormatter={(v) => fmt.shortDate(String(v))}
                  tick={{ fontSize: 12, fill: MUTED }}
                />
                <YAxis
                  width={76}
                  tickFormatter={(v) => formatAxis(Number(v))}
                  tick={{ fontSize: 12, fill: MUTED }}
                  domain={['auto', 'auto']}
                />
                {mode !== 'value' && <ReferenceLine y={0} stroke={MUTED} strokeOpacity={0.6} />}

                {mode === 'performance' && drawdown && drawdownStart && (
                  <ReferenceArea
                    x1={drawdownStart}
                    x2={drawdown.troughDate}
                    fill={LOSS}
                    fillOpacity={0.08}
                    ifOverflow="hidden"
                  />
                )}

                {mode === 'value' ? (
                  <>
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={PRIMARY}
                      strokeWidth={2}
                      fill={PRIMARY}
                      fillOpacity={0.08}
                      isAnimationActive={false}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="secondary"
                      stroke={MUTED}
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </>
                ) : mode === 'performance' ? (
                  <>
                    <Line
                      type="monotone"
                      dataKey="secondary"
                      stroke={MUTED}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={PRIMARY}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </>
                ) : (
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="url(#plStroke)"
                    strokeWidth={2}
                    fill="url(#plFill)"
                    isAnimationActive={false}
                  />
                )}

                {mode !== 'performance' && maxRow && (
                  <ReferenceDot x={maxRow.date} y={maxRow.value} r={5} fill={GAIN} stroke="hsl(var(--card))" strokeWidth={2} />
                )}
                {mode !== 'performance' && minRow && minRow !== maxRow && (
                  <ReferenceDot x={minRow.date} y={minRow.value} r={5} fill={LOSS} stroke="hsl(var(--card))" strokeWidth={2} />
                )}

                <Tooltip
                  content={({ active, payload }) => {
                    const row = active ? (payload?.[0]?.payload as ChartRow | undefined) : undefined;
                    if (!row) return null;
                    const p = row.point;
                    const daily = dailyReturn.get(p.date) ?? 0;
                    return (
                      <div
                        className="rounded-xl border px-3 py-2 text-sm shadow-sm space-y-0.5"
                        style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
                      >
                        <p className="font-medium mb-1">{fmt.date(p.date)}</p>
                        {mode === 'performance' && (
                          <>
                            <TooltipLine label={t('analyze.performance.portfolio')} value={formatValue(row.value)} color={plColor(row.value)} />
                            {row.secondary != null && (
                              <TooltipLine label={t('analyze.performance.benchmark')} value={formatValue(row.secondary)} color={MUTED} />
                            )}
                          </>
                        )}
                        <TooltipLine
                          label={t('analyze.performance.totalPl')}
                          value={`${fmt.money(p.total_pl)} (${fmt.pct(p.pl_pct)})`}
                          color={plColor(p.total_pl)}
                        />
                        <TooltipLine label={t('analyze.performance.totalValue')} value={fmt.money(p.total_value)} />
                        <TooltipLine label={t('analyze.performance.invested')} value={fmt.money(p.invested)} />
                        <TooltipLine label={t('analyze.chart.dailyReturnLabel')} value={fmt.pct(daily)} color={plColor(daily)} />
                      </div>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs mt-3" style={{ color: MUTED }}>
            {t(`analyze.performance.hints.${mode}`)}
          </p>
        </>
      )}
    </section>
  );
}

// ── Small building blocks ────────────────────────────────

function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div
      className="inline-flex flex-wrap rounded-lg border p-0.5 gap-0.5"
      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted) / 0.5)' }}
      role="tablist"
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.key)}
            className="px-3 py-1 text-sm rounded-md transition-colors font-medium"
            style={{
              backgroundColor: selected ? 'hsl(var(--card))' : 'transparent',
              color: selected ? 'hsl(var(--foreground))' : MUTED,
              boxShadow: selected ? '0 1px 2px rgb(0 0 0 / 0.08)' : undefined,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
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
  lines: (ReactNode | false)[];
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg border p-4 flex flex-col gap-1"
      style={{ borderColor: 'hsl(var(--border))' }}
      title={hint}
    >
      <span className="text-sm" style={{ color: MUTED }}>
        {label}
      </span>
      <span className="text-xl font-bold" style={{ color: color ?? 'hsl(var(--foreground))' }}>
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

function TooltipLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <p className="flex justify-between gap-4">
      <span style={{ color: MUTED }}>{label}</span>
      <span className="font-medium" style={{ color }}>
        {value}
      </span>
    </p>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed p-8 text-center" style={{ borderColor: 'hsl(var(--border))' }}>
      <p style={{ color: MUTED }}>{text}</p>
    </div>
  );
}
