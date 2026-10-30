import { describe, expect, it } from 'vitest';
import { combineDividends, combineSeries, combineTotals } from './combine';
import type { AnalysisTotals, DividendReceipt, PerformancePoint } from '@/components/analysis/types';

/** Point from value and money put in so far; TWR as the backend reports it. */
function pt(date: string, value: number, invested: number, twr: number, bench: number | null = null): PerformancePoint {
  const pl = value - invested;
  return {
    date,
    market_value: value,
    cash: 0,
    invested,
    total_value: value,
    realized_pl: 0,
    unrealized_pl: pl,
    dividend_income: 0,
    total_pl: pl,
    pl_pct: (pl / invested) * 100,
    twr_pct: twr,
    benchmark_close: bench,
    usd_close: null,
    gold_close: null,
  };
}

describe('combineSeries', () => {
  it('is the series itself for one portfolio', () => {
    const a = [pt('2026-01-05', 1000, 1000, 0), pt('2026-01-06', 1100, 1000, 10), pt('2026-01-07', 1600, 1500, 10)];
    const combined = combineSeries([a]);
    expect(combined.map((p) => p.total_value)).toEqual([1000, 1100, 1600]);
    expect(combined.map((p) => p.twr_pct)).toEqual([0, 10, 10].map((v) => expect.closeTo(v, 10)));
  });

  it('sums money, carries a late starter in from its first day and re-chains TWR', () => {
    const a = [pt('2026-01-05', 1000, 1000, 0), pt('2026-01-06', 1100, 1000, 10), pt('2026-01-07', 1210, 1000, 21)];
    // b starts a day later with 1000 and loses 10% the next day.
    const b = [pt('2026-01-06', 1000, 1000, 0), pt('2026-01-07', 900, 1000, -10)];
    const combined = combineSeries([a, b]);

    expect(combined.map((p) => p.date)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
    expect(combined.map((p) => p.invested)).toEqual([1000, 2000, 2000]);
    expect(combined.map((p) => p.total_value)).toEqual([1000, 2100, 2110]);
    // Day 2: (2100) / (1000 + 1000 new) → +5%; day 3: 2110 / 2100.
    expect(combined[1].twr_pct).toBeCloseTo(5, 10);
    expect(combined[2].twr_pct).toBeCloseTo((1.05 * (2110 / 2100) - 1) * 100, 10);
    expect(combined[2].pl_pct).toBeCloseTo((110 / 2000) * 100, 10);
  });

  it('carries a portfolio forward on a day it has no point', () => {
    const a = [pt('2026-01-05', 1000, 1000, 0), pt('2026-01-07', 1000, 1000, 0)];
    const b = [pt('2026-01-05', 500, 500, 0), pt('2026-01-06', 550, 500, 10), pt('2026-01-07', 550, 500, 10)];
    expect(combineSeries([a, b]).map((p) => p.total_value)).toEqual([1500, 1550, 1550]);
  });

  it('takes the comparison lines from whichever series has them, carried forward', () => {
    const a = [pt('2026-01-05', 1000, 1000, 0, 9000), pt('2026-01-06', 1000, 1000, 0, null)];
    const b = [pt('2026-01-06', 1000, 1000, 0, null)];
    expect(combineSeries([a, b]).map((p) => p.benchmark_close)).toEqual([9000, 9000]);
  });

  it('is empty without points', () => {
    expect(combineSeries([[], []])).toEqual([]);
  });
});

describe('combineTotals', () => {
  it('adds money and recomputes the P/L %', () => {
    const t = (invested: number, pl: number): AnalysisTotals => ({
      total_invested: invested,
      portfolio_value: invested + pl,
      in_the_safe: 0,
      realized_pl: 0,
      unrealized_pl: pl,
      dividend_income: 0,
      commission_paid: 1,
      total_pl: pl,
      total_pl_pct: (pl / invested) * 100,
    });
    const total = combineTotals([t(1000, 100), t(3000, -100)]);
    expect(total.total_invested).toBe(4000);
    expect(total.total_pl).toBe(0);
    expect(total.total_pl_pct).toBe(0);
    expect(total.commission_paid).toBe(2);
  });
});

describe('combineDividends', () => {
  const r = (ticker: string, exDate: string, quantity: number): DividendReceipt => ({
    ex_date: exDate,
    ticker,
    quantity,
    gross_per_share: 2,
    withholding_rate: 0.15,
    gross_amount: quantity * 2,
    net_amount: quantity * 1.7,
  });

  it('merges the same stock and day across portfolios, newest first', () => {
    const merged = combineDividends([
      { total_gross: 220, total_net: 187, receipts: [r('A.IS', '2026-05-01', 100), r('B.IS', '2026-03-01', 10)] },
      { total_gross: 100, total_net: 85, receipts: [r('A.IS', '2026-05-01', 50)] },
    ]);
    expect(merged.receipts.map((d) => [d.ticker, d.quantity])).toEqual([
      ['A.IS', 150],
      ['B.IS', 10],
    ]);
    expect(merged.receipts[0].net_amount).toBeCloseTo(255, 10);
    expect(merged.total_gross).toBe(320);
  });
});
