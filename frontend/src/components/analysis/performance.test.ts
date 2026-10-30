import { describe, expect, it } from 'vitest';
import {
  annualizedVolatility,
  dailyReturns,
  maxDrawdown,
  periodReturns,
  periodStats,
  rangeStart,
  rebasedPerformance,
  shiftMonths,
  sliceRange,
  unitPrice,
} from './performance';
import type { PerformancePoint } from './types';

/** Minimal point: TWR %, P/L TL, benchmark close; the rest is derived. */
function pt(date: string, twr: number, pl = 0, bench: number | null = null): PerformancePoint {
  const invested = 1000;
  return {
    date,
    market_value: invested + pl,
    cash: 0,
    invested,
    total_value: invested + pl,
    realized_pl: 0,
    unrealized_pl: pl,
    dividend_income: 0,
    total_pl: pl,
    pl_pct: (pl / invested) * 100,
    twr_pct: twr,
    benchmark_close: bench,
  };
}

describe('dates', () => {
  it('shifts months and clamps to month end', () => {
    expect(shiftMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(shiftMonths('2026-01-15', -3)).toBe('2025-10-15');
    expect(shiftMonths('2026-10-28', -12)).toBe('2025-10-28');
  });

  it('computes range starts', () => {
    expect(rangeStart('1M', '2026-10-28')).toBe('2026-09-28');
    expect(rangeStart('YTD', '2026-10-28')).toBe('2026-01-01');
    expect(rangeStart('ALL', '2026-10-28')).toBeNull();
  });
});

describe('sliceRange', () => {
  const points = [
    pt('2026-08-29', 0),
    pt('2026-09-26', 5),
    pt('2026-09-29', 6),
    pt('2026-10-28', 8),
  ];

  it('keeps the last point before the range as baseline', () => {
    const slice = sliceRange(points, '1M'); // from 2026-09-28
    expect(slice.baseline?.date).toBe('2026-09-26');
    expect(slice.points.map((p) => p.date)).toEqual(['2026-09-29', '2026-10-28']);
  });

  it('returns everything without baseline when history is shorter than the range', () => {
    const slice = sliceRange(points, '1Y');
    expect(slice.baseline).toBeNull();
    expect(slice.points).toHaveLength(4);
  });
});

describe('periodStats', () => {
  it('measures return from the baseline, not from the first point in range', () => {
    // Baseline growth 1.10, end growth 1.21 → +10%
    const stats = periodStats({
      baseline: pt('2026-01-30', 10),
      points: [pt('2026-02-02', 15), pt('2026-02-27', 21)],
    })!;
    expect(stats.returnPct).toBeCloseTo(10, 10);
  });

  it('finds the P/L peak and how far below it the end is', () => {
    const stats = periodStats({
      baseline: null,
      points: [pt('2026-01-02', 0, 100), pt('2026-02-02', 0, 900), pt('2026-03-02', 0, 400)],
    })!;
    expect(stats.peakPl).toEqual({ date: '2026-02-02', totalPl: 900, plPct: 90 });
    expect(stats.troughPl.date).toBe('2026-01-02');
    expect(stats.belowPeakPl).toBe(-500);
    expect(stats.plChange).toBe(400);
  });

  it('compares with the benchmark over the same window', () => {
    const stats = periodStats({
      baseline: pt('2026-01-30', 0, 0, 10000),
      points: [pt('2026-02-27', 5, 0, 11000)],
    })!;
    expect(stats.benchmarkReturnPct).toBeCloseTo(10, 10);
  });

  it('reports the current drawdown from the running peak', () => {
    const stats = periodStats({
      baseline: null,
      points: [pt('2026-01-02', 20), pt('2026-01-05', 50), pt('2026-01-06', 20)],
    })!;
    // 1.2 / 1.5 − 1 = −20%
    expect(stats.currentDrawdownPct).toBeCloseTo(-20, 10);
  });
});

describe('maxDrawdown', () => {
  it('finds the deepest fall and its recovery', () => {
    const dd = maxDrawdown({
      baseline: null,
      points: [
        pt('2026-01-02', 0),
        pt('2026-01-05', 25), // peak 1.25
        pt('2026-01-06', 0), // −20%
        pt('2026-01-07', 12.5), // −10% (shallower)
        pt('2026-01-08', 25), // recovered
        pt('2026-01-09', 30),
      ],
    })!;
    expect(dd.pct).toBeCloseTo(-20, 10);
    expect(dd.peakDate).toBe('2026-01-05');
    expect(dd.troughDate).toBe('2026-01-06');
    expect(dd.recoveryDate).toBe('2026-01-08');
  });

  it('counts a fall from the starting value and leaves recovery open', () => {
    const dd = maxDrawdown({
      baseline: pt('2025-12-31', 0),
      points: [pt('2026-01-02', -10), pt('2026-01-05', -5)],
    })!;
    expect(dd.pct).toBeCloseTo(-10, 10);
    expect(dd.peakDate).toBe('2025-12-31');
    expect(dd.recoveryDate).toBeNull();
  });

  it('is null when the series never falls', () => {
    expect(maxDrawdown({ baseline: null, points: [pt('2026-01-02', 1), pt('2026-01-05', 2)] })).toBeNull();
  });
});

describe('rebasedPerformance', () => {
  it('starts both lines at 0% at the range start', () => {
    const rows = rebasedPerformance({
      baseline: pt('2026-01-30', 10, 0, 100),
      points: [pt('2026-02-02', 21, 0, 110)],
    });
    expect(rows[0].portfolioPct).toBeCloseTo(10, 10);
    expect(rows[0].benchmarkPct).toBeCloseTo(10, 10);
  });
});

describe('fund view', () => {
  it('prices the portfolio like a fund starting at 1.0000', () => {
    expect(unitPrice(pt('2026-01-02', 0))).toBe(1);
    expect(unitPrice(pt('2026-01-05', 25))).toBe(1.25);
  });

  it('computes daily unit price changes', () => {
    const r = dailyReturns([pt('2026-01-02', 10), pt('2026-01-05', 21)]);
    expect(r[0]).toBeCloseTo(10, 10);
    expect(r[1]).toBeCloseTo(10, 10); // 1.21 / 1.10
  });

  it('leaves periods longer than the history empty', () => {
    const points = [
      pt('2026-07-01', 0, 0, 100),
      pt('2026-09-28', 10, 0, 110),
      pt('2026-10-28', 21, 0, 121),
    ];
    const byRange = Object.fromEntries(periodReturns(points).map((r) => [r.range, r]));
    expect(byRange['1M'].returnPct).toBeCloseTo(10, 10);
    expect(byRange['1M'].benchmarkPct).toBeCloseTo(10, 10);
    expect(byRange['1Y'].returnPct).toBeNull();
    expect(byRange.ALL.returnPct).toBeCloseTo(21, 10);
  });

  it('needs enough days for volatility', () => {
    expect(annualizedVolatility([pt('2026-01-02', 0)])).toBeNull();
    const flat = Array.from({ length: 30 }, (_, i) => pt(`2026-01-${String(i + 1).padStart(2, '0')}`, 0));
    expect(annualizedVolatility(flat)).toBe(0);
  });
});
