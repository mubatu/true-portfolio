import { describe, expect, it } from 'vitest';
import { allocationAsPositions, elapsed, toPerformancePoints } from './publicData';

describe('elapsed', () => {
  it('counts whole months and splits years', () => {
    expect(elapsed('2024-10-30', '2026-10-30')).toEqual({ years: 2, months: 0, days: 0 });
    expect(elapsed('2024-10-30', '2026-10-29')).toEqual({ years: 1, months: 11, days: 0 });
    expect(elapsed('2026-01-31', '2026-03-01')).toEqual({ years: 0, months: 1, days: 0 });
  });

  it('falls back to days under a month', () => {
    expect(elapsed('2026-10-10', '2026-10-30')).toEqual({ years: 0, months: 0, days: 20 });
    expect(elapsed('2026-10-30', '2026-10-30')).toEqual({ years: 0, months: 0, days: 0 });
  });
});

describe('public data in widget shapes', () => {
  it('keeps the unit price series and zeroes every amount', () => {
    const [p] = toPerformancePoints([
      { date: '2026-10-30', twr_pct: 12.5, benchmark_close: 9000, usd_close: 41, gold_close: 5000 },
    ]);
    expect(p.twr_pct).toBe(12.5);
    expect(p.benchmark_close).toBe(9000);
    expect([p.total_value, p.invested, p.total_pl, p.market_value, p.cash]).toEqual([0, 0, 0, 0, 0]);
  });

  it('uses the weight as the slice value', () => {
    const [a] = allocationAsPositions({ positions: [{ ticker: 'AAA.IS', weight_pct: 60 }], cash_pct: 5 });
    expect([a.ticker, a.market_value, a.weight_pct, a.quantity]).toEqual(['AAA.IS', 60, 60, 1]);
  });
});
