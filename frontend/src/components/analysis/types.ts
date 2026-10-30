// Response of GET /portfolios/{id}/analyze (backend/app/services/analysis.py).

/** One row of the per-stock P/L table (open or fully closed). */
export interface Position {
  ticker: string;
  quantity: number;
  avg_cost: number;
  price: number | null;
  market_value: number;
  cost_basis: number;
  /** Share of the open positions' market value, %. */
  weight_pct: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  /** Realized on sales, incl. sold rights. */
  realized_pl: number;
  dividend_income: number;
  commission_paid: number;
  /** Everything ever paid for buys, commission included. */
  invested: number;
  total_pl: number;
  total_pl_pct: number;
  /** Shares sold over the position's life (a closed one: in the basis of its close). */
  sold_quantity: number;
  /** Average cost of the shares sold, commission included; null if none sold. */
  avg_sold_cost: number | null;
  /** Average net sale price, commission deducted; null if none sold. */
  avg_sell_price: number | null;
  /** Day of the sale that emptied the position; null while held. */
  closed_on: string | null;
}

export interface AnalysisTotals {
  total_invested: number;
  portfolio_value: number;
  in_the_safe: number;
  realized_pl: number;
  unrealized_pl: number;
  dividend_income: number;
  commission_paid: number;
  total_pl: number;
  total_pl_pct: number;
}

export interface DividendReceipt {
  ex_date: string;
  ticker: string;
  quantity: number;
  gross_per_share: number;
  withholding_rate: number;
  gross_amount: number;
  net_amount: number;
}

export interface DividendSummary {
  total_gross: number;
  total_net: number;
  receipts: DividendReceipt[];
}

export interface AnalysisWarning {
  code: 'market_data_unavailable' | 'rights_issue_review' | 'fund_prices_outdated';
  ticker: string;
}

/** One market day, valued at that day's close. */
export interface PerformancePoint {
  date: string;
  market_value: number;
  cash: number;
  invested: number;
  total_value: number;
  realized_pl: number;
  unrealized_pl: number;
  dividend_income: number;
  total_pl: number;
  /** Cumulative P/L as % of money invested so far. */
  pl_pct: number;
  /** Cumulative time-weighted return: performance without new-money effects. */
  twr_pct: number;
  /** Market benchmark (XU100) close, carried forward. */
  benchmark_close: number | null;
  /** USD/TRY, carried forward. */
  usd_close: number | null;
  /** Gram gold in TRY (ounce future × USD/TRY), carried forward. */
  gold_close: number | null;
}

export interface PerformanceSeries {
  start_date: string | null;
  end_date: string | null;
  points: PerformancePoint[];
}

export interface AnalysisResponse {
  portfolio_id: number;
  market_data: { synced: string[]; failed: string[] };
  performance_series: PerformanceSeries;
  positions: Position[];
  dividends: DividendSummary;
  totals: AnalysisTotals;
  warnings: AnalysisWarning[];
}
