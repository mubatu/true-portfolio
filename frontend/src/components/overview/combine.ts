/**
 * The Overview: several portfolios read as one. Pure functions.
 *
 * Money fields add up. The time-weighted return cannot be added or
 * averaged; it is chained again from the summed values with the backend's
 * rule (backend/app/services/analysis.py): flows at the start of the day,
 * each day's growth = total_value / (previous total_value + new money).
 */
import type {
  AnalysisResponse,
  AnalysisTotals,
  DividendReceipt,
  DividendSummary,
  PerformancePoint,
  Position,
} from '@/components/analysis/types';

type MoneyField =
  | 'market_value'
  | 'cash'
  | 'invested'
  | 'total_value'
  | 'realized_pl'
  | 'unrealized_pl'
  | 'dividend_income'
  | 'total_pl';

const MONEY_FIELDS: MoneyField[] = [
  'market_value',
  'cash',
  'invested',
  'total_value',
  'realized_pl',
  'unrealized_pl',
  'dividend_income',
  'total_pl',
];

const COMPARISON_FIELDS = ['benchmark_close', 'usd_close', 'gold_close'] as const;

/**
 * One daily series for several portfolios. Each portfolio counts from its
 * first day; on a day it has no point (it had not started yet, or its
 * series ends earlier) its latest earlier point is carried forward.
 * Comparison lines are the same market data in every series; the first
 * known close of the day is used, carried forward.
 */
export function combineSeries(series: PerformancePoint[][]): PerformancePoint[] {
  const dates = [...new Set(series.flatMap((s) => s.map((p) => p.date)))].sort();
  const cursor = series.map(() => 0);
  const latest: (PerformancePoint | null)[] = series.map(() => null);
  const comparison: Record<(typeof COMPARISON_FIELDS)[number], number | null> = {
    benchmark_close: null,
    usd_close: null,
    gold_close: null,
  };

  let twrFactor = 1;
  let prevValue = 0;
  let prevInvested = 0;

  return dates.map((date) => {
    series.forEach((s, i) => {
      while (cursor[i] < s.length && s[cursor[i]].date <= date) latest[i] = s[cursor[i]++];
    });

    const sum = Object.fromEntries(MONEY_FIELDS.map((f) => [f, 0])) as Record<MoneyField, number>;
    for (const p of latest) {
      if (!p) continue;
      for (const f of MONEY_FIELDS) sum[f] += p[f];
    }
    for (const f of COMPARISON_FIELDS) {
      const today = latest.map((p) => (p?.date === date ? p[f] : null)).find((v) => v != null);
      comparison[f] = today ?? comparison[f];
    }

    const startValue = prevValue + (sum.invested - prevInvested);
    if (startValue > 0) twrFactor *= sum.total_value / startValue;
    prevValue = sum.total_value;
    prevInvested = sum.invested;

    return {
      date,
      ...sum,
      pl_pct: sum.invested > 0 ? (sum.total_pl / sum.invested) * 100 : 0,
      twr_pct: (twrFactor - 1) * 100,
      ...comparison,
    };
  });
}

export function combineTotals(totals: AnalysisTotals[]): AnalysisTotals {
  const sum = (f: keyof AnalysisTotals) => totals.reduce((acc, t) => acc + t[f], 0);
  const invested = sum('total_invested');
  const totalPl = sum('total_pl');
  return {
    total_invested: invested,
    portfolio_value: sum('portfolio_value'),
    in_the_safe: sum('in_the_safe'),
    realized_pl: sum('realized_pl'),
    unrealized_pl: sum('unrealized_pl'),
    dividend_income: sum('dividend_income'),
    commission_paid: sum('commission_paid'),
    total_pl: totalPl,
    total_pl_pct: invested > 0 ? (totalPl / invested) * 100 : 0,
  };
}

/** All receipts, newest first; the same stock on the same ex-date in
 * several portfolios becomes one row. */
export function combineDividends(summaries: DividendSummary[]): DividendSummary {
  const byKey = new Map<string, DividendReceipt>();
  for (const r of summaries.flatMap((s) => s.receipts)) {
    const key = `${r.ticker}|${r.ex_date}`;
    const seen = byKey.get(key);
    byKey.set(
      key,
      seen
        ? {
            ...seen,
            quantity: seen.quantity + r.quantity,
            gross_amount: seen.gross_amount + r.gross_amount,
            net_amount: seen.net_amount + r.net_amount,
          }
        : { ...r }
    );
  }
  const receipts = [...byKey.values()].sort(
    (a, b) => b.ex_date.localeCompare(a.ex_date) || a.ticker.localeCompare(b.ticker)
  );
  return {
    total_gross: summaries.reduce((acc, s) => acc + s.total_gross, 0),
    total_net: summaries.reduce((acc, s) => acc + s.total_net, 0),
    receipts,
  };
}

/** One portfolio as a row of the Overview (its "position" in the whole). */
export interface PortfolioRow {
  id: number;
  name: string;
  slug: string;
  market: string;
  /** Open positions + cash. */
  value: number;
  /** Share of all included portfolios' value, %. */
  weight_pct: number;
  invested: number;
  unrealized_pl: number;
  realized_pl: number;
  dividend_income: number;
  total_pl: number;
  /** total_pl / invested, %. */
  total_pl_pct: number;
  /** Time-weighted return since the portfolio's first day, %; null without a series. */
  twr_pct: number | null;
}

export function portfolioRows(
  items: { portfolio: { id: number; name: string; slug: string; market: string }; analysis: AnalysisResponse }[]
): PortfolioRow[] {
  const valueOf = (a: AnalysisResponse) => a.totals.portfolio_value + a.totals.in_the_safe;
  const total = items.reduce((acc, { analysis }) => acc + valueOf(analysis), 0);
  return items
    .map(({ portfolio, analysis }) => {
      const t = analysis.totals;
      const points = analysis.performance_series.points;
      const value = valueOf(analysis);
      return {
        id: portfolio.id,
        name: portfolio.name,
        slug: portfolio.slug,
        market: portfolio.market,
        value,
        weight_pct: total > 0 ? (value / total) * 100 : 0,
        invested: t.total_invested,
        unrealized_pl: t.unrealized_pl,
        realized_pl: t.realized_pl,
        dividend_income: t.dividend_income,
        total_pl: t.total_pl,
        total_pl_pct: t.total_pl_pct,
        twr_pct: points.length > 0 ? points[points.length - 1].twr_pct : null,
      };
    })
    .sort((a, b) => b.value - a.value);
}

/**
 * Portfolio rows in the shape the shared analysis widgets (allocation,
 * insights) read: "ticker" is the portfolio id, a portfolio with any value
 * counts as held, and its value includes its cash.
 */
export function rowsAsPositions(rows: PortfolioRow[]): Position[] {
  return rows.map((r) => ({
    ticker: String(r.id),
    quantity: r.value > 0.005 ? 1 : 0,
    avg_cost: 0,
    price: null,
    market_value: r.value,
    cost_basis: 0,
    weight_pct: r.weight_pct,
    unrealized_pl: r.unrealized_pl,
    unrealized_pl_pct: 0,
    realized_pl: r.realized_pl,
    dividend_income: r.dividend_income,
    commission_paid: 0,
    invested: r.invested,
    total_pl: r.total_pl,
    total_pl_pct: r.total_pl_pct,
    sold_quantity: 0,
    avg_sold_cost: null,
    avg_sell_price: null,
    closed_on: null,
  }));
}
