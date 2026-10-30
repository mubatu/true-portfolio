// Response of GET /portfolios/{id}/analyze (backend/app/services/analysis.py).

export interface CurrentHolding {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price: number | null;
  current_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
}

export interface ClosedPosition {
  ticker: string;
  total_invested: number;
  total_returned: number;
  realized_pl: number;
  realized_pl_pct: number;
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
  code: 'market_data_unavailable' | 'rights_issue_review';
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
  current_holdings: CurrentHolding[];
  closed_positions: ClosedPosition[];
  dividends: DividendSummary;
  totals: AnalysisTotals;
  warnings: AnalysisWarning[];
}
