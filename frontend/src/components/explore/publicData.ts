/**
 * Public portfolio data in the shapes the analysis widgets read. The API
 * sends no amounts, so every money field is 0 here; the widgets are used
 * with ``hideAmounts`` and never show them. Pure functions.
 */
import type { PerformancePoint, Position } from '@/components/analysis/types';
import type { PublicPoint, PublicPortfolioDetail } from '@/lib/api';

export function toPerformancePoints(points: PublicPoint[]): PerformancePoint[] {
  return points.map((p) => ({
    ...p,
    market_value: 0,
    cash: 0,
    invested: 0,
    total_value: 0,
    realized_pl: 0,
    unrealized_pl: 0,
    dividend_income: 0,
    total_pl: 0,
    pl_pct: 0,
  }));
}

/** Allocation weights as positions whose "value" is their share, %. */
export function allocationAsPositions(allocation: PublicPortfolioDetail['allocation']): Position[] {
  return allocation.positions.map(({ ticker, weight_pct }) => ({
    ticker,
    quantity: 1,
    avg_cost: 0,
    price: null,
    market_value: weight_pct,
    cost_basis: 0,
    weight_pct,
    unrealized_pl: 0,
    unrealized_pl_pct: 0,
    realized_pl: 0,
    dividend_income: 0,
    commission_paid: 0,
    invested: 0,
    total_pl: 0,
    total_pl_pct: 0,
    sold_quantity: 0,
    avg_sold_cost: null,
    avg_sell_price: null,
    closed_on: null,
  }));
}

/** Whole calendar months from ``start`` to ``end`` (ISO dates), and the
 * leftover days when under a month. */
export function elapsed(start: string, end: string): { years: number; months: number; days: number } {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const total = (ey - sy) * 12 + (em - sm) - (ed < sd ? 1 : 0);
  if (total >= 1) return { years: Math.floor(total / 12), months: total % 12, days: 0 };
  const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
  return { years: 0, months: 0, days: Math.max(days, 0) };
}
