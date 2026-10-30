/**
 * Period analytics on the daily performance series. Pure functions.
 *
 * Two different questions, two different series:
 *  - "How much was I up on that day?"  → total_pl / pl_pct (money view).
 *    New money changes these, so they are shown as levels, not returns.
 *  - "How did the portfolio perform?"  → twr_pct (time-weighted return).
 *    New money does not move it, so returns and drawdowns use it.
 *
 * Fund view: the portfolio is priced like a mutual fund. Its unit price
 * starts at 1.0000 and moves only with the time-weighted return — adding
 * money buys new units at the current price instead of moving the price.
 */
import type { PerformancePoint } from './types';

export const RANGE_KEYS = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export interface RangeSlice {
  /** Close at the range start (on or before it) — the base for returns, if any. */
  baseline: PerformancePoint | null;
  points: PerformancePoint[];
}

export interface PlExtreme {
  date: string;
  totalPl: number;
  plPct: number;
}

export interface Drawdown {
  /** Negative, e.g. -23.4 */
  pct: number;
  peakDate: string | null;
  troughDate: string;
  /** First day back at the previous peak; null if not recovered yet. */
  recoveryDate: string | null;
}

export interface PeriodStats {
  startDate: string;
  endDate: string;
  /** Time-weighted return over the period, %. */
  returnPct: number;
  /** Benchmark price change over the period, %; null without benchmark data. */
  benchmarkReturnPct: number | null;
  /** Change in cumulative P/L over the period, TL. */
  plChange: number;
  peakPl: PlExtreme;
  troughPl: PlExtreme;
  /** Current P/L minus the period's peak P/L (≤ 0), TL. */
  belowPeakPl: number;
  maxDrawdown: Drawdown | null;
  /** Drawdown of the last day from the period's running peak, % (≤ 0). */
  currentDrawdownPct: number;
}

// ── Dates (ISO yyyy-mm-dd strings, calendar math in UTC) ─────────────

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Shift by whole months, clamping to the target month's last day. */
export function shiftMonths(iso: string, months: number): string {
  const { y, m, d } = toUtc(iso);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${pad(tm)}-${pad(Math.min(d, lastDay))}`;
}

/** First calendar day inside the range ending at ``endDate``; null = all. */
export function rangeStart(range: RangeKey, endDate: string): string | null {
  switch (range) {
    case '1M':
      return shiftMonths(endDate, -1);
    case '3M':
      return shiftMonths(endDate, -3);
    case '6M':
      return shiftMonths(endDate, -6);
    case '1Y':
      return shiftMonths(endDate, -12);
    case 'YTD':
      return `${toUtc(endDate).y}-01-01`;
    case 'ALL':
      return null;
  }
}

// ── Slicing ─────────────────────────────────────────────────────────

export function sliceRange(points: PerformancePoint[], range: RangeKey): RangeSlice {
  if (points.length === 0) return { baseline: null, points: [] };

  const start = rangeStart(range, points[points.length - 1].date);
  if (start === null) return { baseline: null, points };

  const firstIn = points.findIndex((p) => p.date >= start);
  if (firstIn < 0) return { baseline: null, points: [] };
  // A close on the start day itself is the base (fund convention: price
  // today vs. price one period ago); otherwise the last close before it.
  if (points[firstIn].date === start) return { baseline: points[firstIn], points: points.slice(firstIn) };
  if (firstIn === 0) return { baseline: null, points };
  return { baseline: points[firstIn - 1], points: points.slice(firstIn) };
}

// ── Growth factors ──────────────────────────────────────────────────

const growth = (p: PerformancePoint) => 1 + p.twr_pct / 100;

/** TWR growth at the start of a slice: baseline's, or 1 (inception). */
const baseGrowth = (slice: RangeSlice) => (slice.baseline ? growth(slice.baseline) : 1);

/** Benchmark close at the start of a slice: baseline's, else first known. */
function baseBenchmark(slice: RangeSlice): number | null {
  if (slice.baseline?.benchmark_close != null) return slice.baseline.benchmark_close;
  return slice.points.find((p) => p.benchmark_close != null)?.benchmark_close ?? null;
}

/** Portfolio TWR and benchmark change, both rebased to 0% at range start. */
export function rebasedPerformance(slice: RangeSlice) {
  const g0 = baseGrowth(slice);
  const b0 = baseBenchmark(slice);
  return slice.points.map((p) => ({
    date: p.date,
    portfolioPct: (growth(p) / g0 - 1) * 100,
    benchmarkPct:
      b0 && p.benchmark_close != null ? (p.benchmark_close / b0 - 1) * 100 : null,
  }));
}

// ── Stats ───────────────────────────────────────────────────────────

export function maxDrawdown(slice: RangeSlice): Drawdown | null {
  if (slice.points.length === 0) return null;

  let peak = baseGrowth(slice);
  let peakDate: string | null = slice.baseline?.date ?? null;
  let worst: Drawdown | null = null;
  let worstPeak = peak;

  for (const p of slice.points) {
    const g = growth(p);
    if (g > peak) {
      peak = g;
      peakDate = p.date;
    }
    const dd = (g / peak - 1) * 100;
    if (dd < 0 && (worst === null || dd < worst.pct)) {
      worst = { pct: dd, peakDate, troughDate: p.date, recoveryDate: null };
      worstPeak = peak;
    }
  }

  if (worst) {
    const trough = worst.troughDate;
    worst.recoveryDate =
      slice.points.find((p) => p.date > trough && growth(p) >= worstPeak)?.date ?? null;
  }
  return worst;
}

const extreme = (p: PerformancePoint): PlExtreme => ({
  date: p.date,
  totalPl: p.total_pl,
  plPct: p.pl_pct,
});

export function periodStats(slice: RangeSlice): PeriodStats | null {
  const { points, baseline } = slice;
  if (points.length === 0) return null;

  const last = points[points.length - 1];
  const b0 = baseBenchmark(slice);

  let peak = points[0];
  let trough = points[0];
  let runningPeak = baseGrowth(slice);
  for (const p of points) {
    if (p.total_pl > peak.total_pl) peak = p;
    if (p.total_pl < trough.total_pl) trough = p;
    runningPeak = Math.max(runningPeak, growth(p));
  }

  return {
    startDate: points[0].date,
    endDate: last.date,
    returnPct: (growth(last) / baseGrowth(slice) - 1) * 100,
    benchmarkReturnPct:
      b0 && last.benchmark_close != null ? (last.benchmark_close / b0 - 1) * 100 : null,
    plChange: last.total_pl - (baseline?.total_pl ?? 0),
    peakPl: extreme(peak),
    troughPl: extreme(trough),
    belowPeakPl: last.total_pl - peak.total_pl,
    maxDrawdown: maxDrawdown(slice),
    currentDrawdownPct: Math.min(0, (growth(last) / runningPeak - 1) * 100),
  };
}

// ── Fund view ───────────────────────────────────────────────────────

/** Unit price of the portfolio "fund" on a day (starts at 1.0000). */
export const unitPrice = (p: PerformancePoint) => growth(p);

/** Day-over-day unit price change, % (first day: vs. 1.0000). */
export function dailyReturns(points: PerformancePoint[]): number[] {
  return points.map((p, i) => (growth(p) / (i > 0 ? growth(points[i - 1]) : 1) - 1) * 100);
}

const TRADING_DAYS_PER_YEAR = 252;

/** Annualized volatility of daily returns, %; null with < 20 days. */
export function annualizedVolatility(points: PerformancePoint[]): number | null {
  const returns = dailyReturns(points).slice(1);
  if (returns.length < 20) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

export interface PeriodReturn {
  range: RangeKey;
  /** null when the history does not reach back to the period start. */
  returnPct: number | null;
  benchmarkPct: number | null;
}

/**
 * Fund-style return table (1M, 3M, 6M, YTD, 1Y, since inception). A period
 * longer than the history is left empty rather than shown as "since start".
 */
export function periodReturns(points: PerformancePoint[]): PeriodReturn[] {
  if (points.length === 0) return [];
  const first = points[0].date;
  const last = points[points.length - 1].date;

  return RANGE_KEYS.map((range) => {
    const start = rangeStart(range, last);
    if (start !== null && start < first) {
      return { range, returnPct: null, benchmarkPct: null };
    }
    const stats = periodStats(sliceRange(points, range));
    return {
      range,
      returnPct: stats?.returnPct ?? null,
      benchmarkPct: stats?.benchmarkReturnPct ?? null,
    };
  });
}
