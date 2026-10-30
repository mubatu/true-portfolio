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
import type { PublicOwner, PublicPortfolioDetail, PublicPortfolioSummary } from '@/lib/api';
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

const mainPoints = series(7, '2024-10-30', { 0: 320_000, 70: 170_000, 140: 60_000, 200: 120_000, 270: 260_000, 330: 50_000, 400: 210_000, 460: 90_000 }, 0.0012, 0.014);
const mainRows = positions(
  [
    ['THYAO.IS', 900, 268.4, 301.25, 4_820, 0],
    ['TUPRS.IS', 1300, 162.3, 171.4, 0, 6_420],
    ['ASELS.IS', 1500, 112.6, 138.9, 0, 0],
    ['AKBNK.IS', 2500, 57.3, 63.1, 3_600, 1_150],
    ['MGROS.IS', 300, 498.0, 471.5, 0, 0],
    ['BIMAS.IS', 240, 455.0, 512.5, 2_150, 1_860],
    ['TCELL.IS', 1200, 88.2, 96.4, 0, 1_420],
    ['KCHOL.IS', 700, 178.9, 165.2, 0, 2_380],
    ['FROTO.IS', 110, 940.0, 1012.0, 0, 3_150],
    ['SISE.IS', 2600, 44.8, 39.6, 0, 980],
    ['EREGL.IS', 3100, 27.4, 25.85, 1_240, 0],
  ],
  [
    ['PGSUS.IS', 220, 812.0, 948.0, '2026-08-12', 0],
    ['ENKAI.IS', 900, 61.2, 74.8, '2026-03-04', 0],
    ['TOASO.IS', 160, 231.0, 266.4, '2026-05-20', 540],
    ['DOAS.IS', 180, 214.0, 199.5, '2025-07-09', 0],
    ['SASA.IS', 4000, 4.95, 4.1, '2025-11-18', 0],
  ]
);
const mainDividends = [
  dividend('2026-10-08', 'TUPRS.IS', 1300, 5.81),
  dividend('2026-09-17', 'FROTO.IS', 110, 33.5),
  dividend('2026-07-02', 'TCELL.IS', 1200, 1.39),
  dividend('2026-06-11', 'KCHOL.IS', 700, 4.0),
  dividend('2026-05-20', 'TOASO.IS', 160, 3.97),
  dividend('2026-04-22', 'BIMAS.IS', 240, 9.12),
  dividend('2026-04-01', 'AKBNK.IS', 2500, 0.54),
  dividend('2025-12-03', 'SISE.IS', 2600, 0.44),
];

const fundPoints = series(11, '2024-10-28', { 0: 200_000, 3: 201_000 }, 0.0005, 0.004);
const fundRows = positions([['TTE.TEFAS', 52_000, 7.42, 8.96, 0, 0]], []);

const goldPoints = series(31, '2025-03-03', { 0: 280_000 }, 0.0006, 0.003);
const goldRows = positions([['GMA.TEFAS', 30_000, 9.35, 11.2, 0, 0]], []);

// Marked experimental: shown on My Portfolios, left out of the Overview.
const trialPoints = series(23, '2025-06-02', { 0: 50_000, 40: 25_000 }, -0.0003, 0.02);
const trialRows = positions([['THYAO.IS', 200, 310, 285, 0, 0], ['ASELS.IS', 150, 120, 131, 0, 0]], []);

export const MOCK_PORTFOLIOS: Portfolio[] = [
  { id: 9, user_id: 'dev', name: 'Long-Term Portfolio', market: 'BIST', slug: 'long-term', created_at: '2026-10-30T10:00:00Z', transaction_count: 64, is_public: true },
  { id: 11, user_id: 'dev', name: 'Equity Fund', market: 'TEFAS', slug: 'equity-fund', created_at: '2026-10-30T12:00:00Z', transaction_count: 2 },
  { id: 14, user_id: 'dev', name: 'Gold Fund', market: 'TEFAS', slug: 'gold-fund', created_at: '2026-10-30T12:30:00Z', transaction_count: 1 },
  { id: 12, user_id: 'dev', name: 'New Portfolio', market: 'BIST', slug: 'new', created_at: '2026-10-30T13:00:00Z', transaction_count: 0 },
  { id: 13, user_id: 'dev', name: 'Momentum Experiment', market: 'BIST', slug: 'momentum', created_at: '2026-10-30T14:00:00Z', transaction_count: 6, is_experimental: true, is_public: true },
];

export const MOCK_ANALYSES: Record<number, AnalysisResponse> = {
  9: analysis(9, mainPoints, mainRows, mainDividends),
  11: analysis(11, fundPoints, fundRows, []),
  13: analysis(13, trialPoints, trialRows, []),
  14: analysis(14, goldPoints, goldRows, []),
};

// Explore: what the backend's /api/explore would send (percentages only).
function publicDetail(p: Portfolio, a: AnalysisResponse, owner: PublicOwner): PublicPortfolioDetail {
  const points = a.performance_series.points.map(({ date, twr_pct, benchmark_close, usd_close, gold_close }) => ({
    date, twr_pct, benchmark_close, usd_close, gold_close,
  }));
  const last = points[points.length - 1];
  const at = (months: number) => {
    const d = new Date(`${last.date}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - months);
    const start = d.toISOString().slice(0, 10);
    const base = [...points].reverse().find((x) => x.date <= start);
    return start < points[0].date || !base ? null : ((1 + last.twr_pct / 100) / (1 + base.twr_pct / 100) - 1) * 100;
  };
  const total = a.totals.portfolio_value + a.totals.in_the_safe;
  return {
    slug: p.slug, name: p.name, market: p.market, is_experimental: !!p.is_experimental, owner,
    start_date: points[0].date, end_date: last.date,
    return_pct: last.twr_pct, return_1m_pct: at(1), return_1y_pct: at(12),
    points,
    allocation: {
      positions: a.positions.filter((x) => x.quantity > 0).map((x) => ({ ticker: x.ticker, weight_pct: (x.market_value / total) * 100 })),
      cash_pct: (a.totals.in_the_safe / total) * 100,
    },
  };
}

const otherOwnerPoints = series(41, '2025-12-01', { 0: 100_000 }, 0.0012, 0.012);
const otherOwnerRows = positions([['ASELS.IS', 400, 95, 131, 0, 0], ['TUPRS.IS', 300, 150, 171, 0, 0], ['BIMAS.IS', 60, 480, 512, 0, 0]], []);
const otherOwner: Portfolio = { id: 99, user_id: 'someone', name: 'Defense & Energy Basket', market: 'BIST', slug: 'defense-energy', created_at: '2025-12-01T10:00:00Z', is_public: true };

export const MOCK_PUBLIC: PublicPortfolioDetail[] = [
  publicDetail(otherOwner, analysis(99, otherOwnerPoints, otherOwnerRows, []), { display_name: 'Elif K.', initials: 'EK' }),
  ...[9, 13].map((id) =>
    publicDetail(MOCK_PORTFOLIOS.find((p) => p.id === id)!, MOCK_ANALYSES[id], { display_name: 'Demo U.', initials: 'DU' })
  ),
].sort((a, b) => (b.return_pct ?? 0) - (a.return_pct ?? 0));

export const MOCK_PUBLIC_LIST: PublicPortfolioSummary[] = MOCK_PUBLIC.map((d) => ({
  slug: d.slug, name: d.name, market: d.market, is_experimental: d.is_experimental, owner: d.owner,
  start_date: d.start_date, end_date: d.end_date,
  return_pct: d.return_pct, return_1m_pct: d.return_1m_pct, return_1y_pct: d.return_1y_pct,
  sparkline: d.points.slice(-90).map((x) => x.twr_pct),
}));

const txn = (id: number, ticker: string, operation: Transaction['operation'], quantity: number, price: number, date: string, portfolio_id = 9): Transaction => ({
  id, portfolio_id, ticker, operation, quantity, price, adjusted_quantity: quantity, adjusted_price: price,
  commission_rate: operation === 'buy' && ticker.endsWith('.TEFAS') ? 0 : 0.00021, date, created_at: `${date}T09:00:00Z`,
});

export const MOCK_TRANSACTIONS: Record<string, Transaction[]> = {
  'long-term': [
    txn(1, 'TCELL.IS', 'buy', 400, 95.1, '2026-10-07'),
    txn(2, 'ASELS.IS', 'buy', 500, 131.2, '2026-09-29'),
    txn(3, 'MGROS.IS', 'buy', 300, 498, '2026-09-18'),
    txn(4, 'PGSUS.IS', 'sell', 220, 948, '2026-08-12'),
    txn(5, 'THYAO.IS', 'sell', 200, 312.5, '2026-07-30'),
    txn(6, 'AKBNK.IS', 'buy', 1000, 59.4, '2026-07-14'),
    txn(7, 'TOASO.IS', 'sell', 160, 266.4, '2026-05-20'),
    txn(8, 'FROTO.IS', 'buy', 110, 940, '2026-04-28'),
    txn(9, 'EREGL.IS', 'sell', 900, 28.8, '2026-03-25'),
    txn(10, 'ENKAI.IS', 'sell', 900, 74.8, '2026-03-04'),
    txn(11, 'KCHOL.IS', 'buy', 700, 178.9, '2026-01-15'),
    txn(12, 'SASA.IS', 'sell', 4000, 4.1, '2025-11-18'),
    txn(13, 'TUPRS.IS', 'buy', 1300, 162.3, '2025-10-21'),
    txn(14, 'BIMAS.IS', 'buy', 240, 455, '2025-09-02'),
  ],
  'equity-fund': [
    txn(20, 'TTE.TEFAS', 'buy', 26_000, 7.46, '2024-11-04', 11),
    txn(21, 'TTE.TEFAS', 'buy', 26_000, 7.38, '2024-10-28', 11),
  ],
  new: [],
};
