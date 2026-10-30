/**
 * Synthetic, deterministic data for the dev-only UI preview (/dev/...).
 * Lets the signed-in pages be designed and screenshotted without an
 * account or a backend. Never imported by production code.
 */
import type {
  AnalysisResponse,
  DividendReceipt,
  PerformancePoint,
  Position,
} from '@/components/analysis/types';
import type { Portfolio, Transaction } from '@/services/portfolioService';

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function marketDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); iso(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(iso(d));
  }
  return days;
}

function series(seed: number, from: string, deposits: Record<number, number>, drift: number, vol: number): PerformancePoint[] {
  const random = rng(seed);
  const days = marketDays(from, '2026-10-28');
  let unit = 1;
  let value = 0;
  let invested = 0;
  let bench = 9000;
  let usd = 34.3;
  let gold = 3050;
  let realized = 0;
  let dividends = 0;
  return days.map((date, i) => {
    const shock = (random() - 0.5) * 2;
    const r = i === 0 ? 0 : drift + vol * shock + (i > 380 && i < 440 ? -0.0015 : 0);
    unit *= 1 + r;
    value *= 1 + r;
    const deposit = deposits[i] ?? 0;
    value += deposit;
    invested += deposit;
    bench *= 1 + drift * 0.6 + vol * 0.8 * shock + (random() - 0.5) * 0.008;
    usd *= 1 + 0.0007 + (random() - 0.5) * 0.002;
    gold *= 1 + 0.0014 + (random() - 0.5) * 0.02;
    if (i % 37 === 0 && i > 0) realized += value * 0.004;
    if (i % 61 === 0 && i > 0) dividends += value * 0.0015;
    const totalPl = value - invested;
    return {
      date,
      market_value: Math.round(value * 0.995),
      cash: Math.round(value * 0.005),
      invested: Math.round(invested),
      total_value: Math.round(value),
      realized_pl: Math.round(realized),
      unrealized_pl: Math.round(totalPl - realized - dividends),
      dividend_income: Math.round(dividends),
      total_pl: Math.round(totalPl),
      pl_pct: invested > 0 ? (totalPl / invested) * 100 : 0,
      twr_pct: (unit - 1) * 100,
      benchmark_close: bench,
      usd_close: usd,
      gold_close: gold,
    };
  });
}

type PositionSeed = [ticker: string, qty: number, avg: number, price: number, realized: number, dividend: number];
type ClosedSeed = [ticker: string, sold: number, cost: number, sell: number, closedOn: string, dividend: number];

function positions(open: PositionSeed[], closed: ClosedSeed[]): Position[] {
  const total = open.reduce((s, [, q, , p]) => s + q * p, 0);
  const openRows = open.map(([ticker, quantity, avg, price, realized, dividend]): Position => {
    const value = quantity * price;
    const cost = quantity * avg;
    const unrealized = value - cost;
    const totalPl = unrealized + realized + dividend;
    return {
      ticker,
      quantity,
      avg_cost: avg,
      price,
      market_value: value,
      cost_basis: cost,
      weight_pct: (value / total) * 100,
      unrealized_pl: unrealized,
      unrealized_pl_pct: (unrealized / cost) * 100,
      realized_pl: realized,
      dividend_income: dividend,
      commission_paid: cost * 0.0002,
      invested: cost,
      total_pl: totalPl,
      total_pl_pct: (totalPl / cost) * 100,
      sold_quantity: 0,
      avg_sold_cost: null,
      avg_sell_price: null,
      closed_on: null,
    };
  });
  const closedRows = closed.map(([ticker, sold, cost, sell, closedOn, dividend]): Position => {
    const realized = sold * (sell - cost);
    const totalPl = realized + dividend;
    return {
      ticker,
      quantity: 0,
      avg_cost: 0,
      price: null,
      market_value: 0,
      cost_basis: 0,
      weight_pct: 0,
      unrealized_pl: 0,
      unrealized_pl_pct: 0,
      realized_pl: realized,
      dividend_income: dividend,
      commission_paid: sold * cost * 0.0002,
      invested: sold * cost,
      total_pl: totalPl,
      total_pl_pct: (totalPl / (sold * cost)) * 100,
      sold_quantity: sold,
      avg_sold_cost: cost,
      avg_sell_price: sell,
      closed_on: closedOn,
    };
  });
  openRows.sort((a, b) => b.market_value - a.market_value);
  closedRows.sort((a, b) => b.total_pl - a.total_pl);
  return [...openRows, ...closedRows];
}

function analysis(id: number, points: PerformancePoint[], rows: Position[], receipts: DividendReceipt[]): AnalysisResponse {
  const last = points[points.length - 1];
  const value = rows.reduce((s, p) => s + p.market_value, 0);
  const unrealized = rows.reduce((s, p) => s + p.unrealized_pl, 0);
  const realized = rows.reduce((s, p) => s + p.realized_pl, 0);
  const dividends = receipts.reduce((s, d) => s + d.net_amount, 0);
  const totalPl = unrealized + realized + dividends;
  // Keep the cards consistent with the table: value + cash − P/L.
  const invested = Math.max(value + 1250.4 - totalPl, last.invested * 0.1);
  return {
    portfolio_id: id,
    market_data: { synced: [], failed: [] },
    performance_series: { start_date: points[0].date, end_date: last.date, points },
    positions: rows,
    dividends: {
      total_gross: receipts.reduce((s, d) => s + d.gross_amount, 0),
      total_net: dividends,
      receipts,
    },
    totals: {
      total_invested: invested,
      portfolio_value: value,
      in_the_safe: 1250.4,
      realized_pl: realized,
      unrealized_pl: unrealized,
      dividend_income: dividends,
      commission_paid: 512.3,
      total_pl: totalPl,
      total_pl_pct: (totalPl / invested) * 100,
    },
    warnings: [],
  };
}

function dividend(ex_date: string, ticker: string, quantity: number, gross: number): DividendReceipt {
  const gross_amount = quantity * gross;
  return { ex_date, ticker, quantity, gross_per_share: gross, withholding_rate: 0.15, gross_amount, net_amount: gross_amount * 0.85 };
}

const mainPoints = series(7, '2024-10-30', { 0: 320_000, 70: 170_000, 140: 60_000, 200: 120_000, 270: 260_000, 330: 50_000, 400: 210_000, 460: 90_000 }, 0.0006, 0.016);
const mainRows = positions(
  [
    ['ISMEN.IS', 4042, 35.39, 25.12, 0, 0],
    ['ULUFA.IS', 57747, 1.73, 1.52, 0, 0],
    ['PLTUR.IS', 5416, 18.49, 13.52, 0, 0],
    ['EUPWR.IS', 1614, 27.64, 41.0, 0, 0],
    ['CLEBI.IS', 49, 1703.52, 1180.0, 0, 412.5],
    ['SAHOL.IS', 630, 80.17, 83.25, 0, 843.55],
    ['OFSYM.IS', 1205, 53.65, 42.52, 0, 431.0],
    ['YEOTK.IS', 2204, 16.73, 22.7, 0, 0],
    ['YYLGD.IS', 7130, 9.16, 6.48, 0, 0],
    ['DESA.IS', 5500, 9.21, 7.84, 0, 392.86],
    ['ASTOR.IS', 215, 92.12, 176.5, 0, 400.43],
    ['KONTR.IS', 1612, 21.06, 1.67, 0, 21.08],
  ],
  [
    ['AKFIS.IS', 894, 22.9, 87.23, '2026-07-21', 0],
    ['ARDYZ.IS', 901, 31.35, 89.88, '2026-08-17', 0],
    ['MEGMT.IS', 924, 29.73, 55.53, '2026-01-05', 0],
    ['VBTYZ.IS', 1000, 18.09, 37.03, '2026-08-24', 0],
    ['SOKM.IS', 376, 39.79, 38.39, '2025-03-12', 0],
  ]
);
const mainDividends = [
  dividend('2026-10-15', 'ASTOR.IS', 215, 2.191),
  dividend('2026-09-30', 'KIMMR.IS', 1520, 0.208),
  dividend('2026-09-30', 'DESA.IS', 5500, 0.084),
  dividend('2026-09-23', 'OFSYM.IS', 1205, 0.421),
  dividend('2026-04-03', 'SAHOL.IS', 630, 1.575),
  dividend('2026-04-03', 'AFYON.IS', 770, 1.5),
  dividend('2025-12-24', 'OBAMS.IS', 84, 0.035),
  dividend('2025-12-10', 'MTRYO.IS', 1000, 0.061),
  dividend('2025-07-08', 'KONTR.IS', 806, 0.031),
];

const fundPoints = series(11, '2024-10-28', { 0: 200_000, 3: 201_000 }, 0.0005, 0.004);
const fundRows = positions([['IPB.TEFAS', 719_849, 0.557, 0.6852, 0, 0]], []);

export const MOCK_PORTFOLIOS: Portfolio[] = [
  { id: 9, user_id: 'dev', name: 'Buber Fon', market: 'BIST', slug: 'buber-fon', created_at: '2026-10-30T10:00:00Z', transaction_count: 115 },
  { id: 11, user_id: 'dev', name: 'IPB İstanbul Portföy', market: 'TEFAS', slug: 'ipb', created_at: '2026-10-30T12:00:00Z', transaction_count: 2 },
  { id: 12, user_id: 'dev', name: 'Yeni Portföy', market: 'BIST', slug: 'yeni', created_at: '2026-10-30T13:00:00Z', transaction_count: 0 },
];

export const MOCK_ANALYSES: Record<number, AnalysisResponse> = {
  9: analysis(9, mainPoints, mainRows, mainDividends),
  11: analysis(11, fundPoints, fundRows, []),
};

const txn = (id: number, ticker: string, operation: Transaction['operation'], quantity: number, price: number, date: string, portfolio_id = 9): Transaction => ({
  id, portfolio_id, ticker, operation, quantity, price, adjusted_quantity: quantity, adjusted_price: price,
  commission_rate: operation === 'buy' && ticker.endsWith('.TEFAS') ? 0 : 0.00021, date, created_at: `${date}T09:00:00Z`,
});

export const MOCK_TRANSACTIONS: Record<string, Transaction[]> = {
  'buber-fon': [
    txn(1, 'FRMPL.IS', 'buy', 1000, 24.06, '2026-10-06'),
    txn(2, 'CWENE.IS', 'buy', 860, 18.66, '2026-10-02'),
    txn(3, 'YYLGD.IS', 'buy', 2800, 7.35, '2026-09-22'),
    txn(4, 'PLTUR.IS', 'buy', 840, 15.44, '2026-09-15'),
    txn(5, 'BRLSM.IS', 'sell', 1000, 25.74, '2026-08-28'),
    txn(6, 'VBTYZ.IS', 'sell', 1000, 37.04, '2026-08-24'),
    txn(7, 'ENKAI.IS', 'buy', 450, 83.6, '2026-08-24'),
    txn(8, 'ARDYZ.IS', 'sell', 901, 89.9, '2026-08-17'),
    txn(9, 'AKFIS.IS', 'sell', 894, 87.25, '2026-07-21'),
    txn(10, 'ULUFA.IS', 'buy', 20000, 1.8, '2026-07-03'),
    txn(11, 'MARTI.IS', 'buy', 7500, 1, '2026-02-26'),
    txn(12, 'KONTR.IS', 'buy', 806, 1, '2025-12-09'),
    txn(13, 'SAHOL.IS', 'buy', 630, 80.15, '2025-10-30'),
    txn(14, 'CLEBI.IS', 'buy', 30, 1702, '2025-08-19'),
  ],
  ipb: [
    txn(20, 'IPB.TEFAS', 'buy', 359_147, 0.559659, '2024-10-31', 11),
    txn(21, 'IPB.TEFAS', 'buy', 360_702, 0.554474, '2024-10-28', 11),
  ],
  yeni: [],
};
