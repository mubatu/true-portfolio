import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowLeft,
  Coins,
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart3,
  CircleDollarSign,
  PiggyBank,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analyzePortfolio, getPortfolioBySlug } from '@/services/portfolioService';
import {
  getDateLocale,
  getLocale,
  getMarketCurrency,
  toDisplayTicker,
} from '@/config';

// ── Helpers ──────────────────────────────────────────────

interface CurrentHolding {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price: number | null;
  current_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
}

interface ClosedPosition {
  ticker: string;
  total_invested: number;
  total_returned: number;
  realized_pl: number;
  realized_pl_pct: number;
}

interface AnalysisTotals {
  total_invested: number;
  portfolio_value: number;
  in_the_safe: number;
  realized_pl: number;
  unrealized_pl: number;
  dividend_income: number;
  total_pl: number;
  total_pl_pct: number;
}

interface DividendReceipt {
  ex_date: string;
  ticker: string;
  quantity: number;
  gross_per_share: number;
  withholding_rate: number;
  gross_amount: number;
  net_amount: number;
}

interface DividendSummary {
  total_gross: number;
  total_net: number;
  receipts: DividendReceipt[];
}

interface AnalysisWarning {
  code: 'dividends_unavailable' | 'splits_unavailable';
  ticker: string;
}

interface PerformancePoint {
  date: string;
  price: number;
  pl_pct: number;
}

interface ChartPerformancePoint extends PerformancePoint {
  daily_pl_pct: number;
}

interface PerformanceSeries {
  start_date: string | null;
  end_date: string | null;
  points: PerformancePoint[];
}

interface AnalysisResponse {
  portfolio_id: number;
  backfill: unknown;
  performance_series: PerformanceSeries;
  current_holdings: CurrentHolding[];
  closed_positions: ClosedPosition[];
  dividends: DividendSummary;
  totals: AnalysisTotals;
  warnings: AnalysisWarning[];
}

const plColor = (value: number) =>
  value >= 0 ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)';

const plBg = (value: number) =>
  value >= 0 ? 'hsl(142 76% 36% / 0.1)' : 'hsl(0 84% 60% / 0.1)';

const parseIsoDate = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// ── Component ────────────────────────────────────────────

export function PortfolioAnalyze() {
  const { slug } = useParams<{ slug: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const { data: portfolio, isLoading: isPortfolioLoading } = useQuery({
    queryKey: ['portfolio', slug],
    queryFn: () => getPortfolioBySlug(slug!),
    enabled: !!slug,
  });

  const {
    data: analysis,
    isLoading: isAnalysisLoading,
    error,
  } = useQuery<AnalysisResponse>({
    queryKey: ['portfolio-analysis', portfolio?.id],
    queryFn: () => analyzePortfolio(portfolio!.id),
    enabled: !!portfolio?.id,
  });

  const isLoading = isPortfolioLoading || isAnalysisLoading;

  const currencyCode = portfolio ? getMarketCurrency(portfolio.market) : 'TRY';
  const numberLocale = getLocale(i18n.language);
  const dateLocale = getDateLocale(i18n.language);

  const fmt = (v: number) =>
    new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: currencyCode,
    }).format(v);

  const fmtNumber = (v: number) =>
    new Intl.NumberFormat(numberLocale).format(v);

  const pct = (v: number) =>
    `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

  const fmtDate = (isoDate: string) =>
    new Intl.DateTimeFormat(dateLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(parseIsoDate(isoDate));

  const fmtRate = (v: number) =>
    new Intl.NumberFormat(numberLocale, {
      style: 'percent',
      maximumFractionDigits: 2,
    }).format(v);

  const displayTicker = (ticker: string) =>
    toDisplayTicker(ticker, portfolio?.market ?? 'BIST');

  // ── Render ───────────────────────────────────────────

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 mb-6"
        onClick={() => navigate('/dashboard')}
      >
        <ArrowLeft className="h-4 w-4" />
        {t('analyze.backToDashboard')}
      </Button>

      {/* Title */}
      <h1 className="text-3xl font-bold mb-2">
        {portfolio?.name
          ? t('analyze.title', { name: portfolio.name })
          : t('common.dashboard')}
      </h1>
      <p className="text-sm mb-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {t('analyze.subtitle')}
      </p>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="rounded-lg border p-4 text-center"
          style={{
            borderColor: 'hsl(var(--destructive))',
            backgroundColor: 'hsl(var(--destructive) / 0.1)',
          }}
        >
          <p style={{ color: 'hsl(var(--destructive))' }}>
            {t('common.error')}: {(error as Error).message}
          </p>
        </div>
      )}

      {/* Content */}
      {!isLoading && analysis && (
        <>
          {analysis.warnings.length > 0 && (
            <div
              className="rounded-lg border p-4 mb-6 flex gap-3"
              style={{
                borderColor: 'hsl(38 92% 50%)',
                backgroundColor: 'hsl(38 92% 50% / 0.1)',
              }}
            >
              <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: 'hsl(38 92% 40%)' }} />
              <div className="text-sm">
                <p className="font-medium mb-1">{t('analyze.warnings.title')}</p>
                <ul className="list-disc pl-4">
                  {analysis.warnings.map((w) => (
                    <li key={`${w.code}-${w.ticker}`}>
                      {t(`analyze.warnings.${w.code}`, { ticker: displayTicker(w.ticker) })}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <PerformanceChart
            series={analysis.performance_series}
            numberLocale={numberLocale}
            dateLocale={dateLocale}
            lineColor={plColor(analysis.totals.total_pl)}
          />

          {/* ── Summary Cards ─────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-8">
            {/* Total Invested (from pocket) */}
            <SummaryCard
              icon={<Wallet className="h-5 w-5 text-primary" />}
              label={t('analyze.totalInvested')}
              value={fmt(analysis.totals.total_invested)}
            />
            {/* Portfolio Value */}
            <SummaryCard
              icon={<CircleDollarSign className="h-5 w-5 text-primary" />}
              label={t('analyze.portfolioValue')}
              value={fmt(analysis.totals.portfolio_value)}
            />
            {/* In the Safe */}
            <SummaryCard
              icon={<PiggyBank className="h-5 w-5 text-primary" />}
              label={t('analyze.inTheSafe')}
              value={fmt(analysis.totals.in_the_safe)}
            />
            {/* Dividend Income (net, already included in Total P/L) */}
            <SummaryCard
              icon={<Coins className="h-5 w-5 text-primary" />}
              label={t('analyze.dividendIncome')}
              value={fmt(analysis.totals.dividend_income)}
              sub={t('analyze.dividendIncomeSub', { gross: fmt(analysis.dividends.total_gross) })}
              color={analysis.dividends.total_gross > 0 ? undefined : 'hsl(var(--muted-foreground))'}
            />
            {/* Total P/L */}
            <SummaryCard
              icon={<BarChart3 className="h-5 w-5" style={{ color: plColor(analysis.totals.total_pl) }} />}
              label={t('analyze.totalPl')}
              value={fmt(analysis.totals.total_pl)}
              sub={pct(analysis.totals.total_pl_pct)}
              color={plColor(analysis.totals.total_pl)}
            />
          </div>

          {/* ── Holdings Table ────────────────────────── */}
          {/* ── Current Holdings ─────────────────────── */}
          <h2 className="text-xl font-semibold mb-4">{t('analyze.currentHoldings')}</h2>

          {analysis.current_holdings.length === 0 ? (
            <div
              className="rounded-lg border-2 border-dashed p-8 text-center mb-8"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                {t('analyze.noCurrentHoldings')}
              </p>
            </div>
          ) : (
            <div
              className="rounded-lg border overflow-hidden mb-8"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}>
                      <th className="text-left px-4 py-3 text-sm font-medium">
                        {t('analyze.table.ticker')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.qty')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.avgCost')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.price')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.value')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.unrealized')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.pct')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.current_holdings.map((h) => (
                      <tr
                        key={h.ticker}
                        className="border-t transition-colors hover:bg-muted/50"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <td className="px-4 py-3 font-semibold">
                          {toDisplayTicker(h.ticker, portfolio?.market ?? 'BIST')}
                        </td>
                        <td className="text-right px-4 py-3">
                          {fmtNumber(h.quantity)}
                        </td>
                        <td className="text-right px-4 py-3">
                          {fmt(h.avg_cost)}
                        </td>
                        <td className="text-right px-4 py-3">
                          {h.current_price != null ? fmt(h.current_price) : '—'}
                        </td>
                        <td className="text-right px-4 py-3">
                          {fmt(h.current_value)}
                        </td>
                        <td
                          className="text-right px-4 py-3 font-medium"
                          style={{ color: plColor(h.unrealized_pl) }}
                        >
                          {fmt(h.unrealized_pl)}
                        </td>
                        <td className="text-right px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium"
                            style={{
                              backgroundColor: plBg(h.unrealized_pl_pct),
                              color: plColor(h.unrealized_pl_pct),
                            }}
                          >
                            {h.unrealized_pl_pct >= 0 ? (
                              <TrendingUp className="h-3.5 w-3.5" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5" />
                            )}
                            {pct(h.unrealized_pl_pct)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Closed Positions ──────────────────────── */}
          <h2 className="text-xl font-semibold mb-4">{t('analyze.closedPositions')}</h2>

          {analysis.closed_positions.length === 0 ? (
            <div
              className="rounded-lg border-2 border-dashed p-8 text-center"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                {t('analyze.noClosedPositions')}
              </p>
            </div>
          ) : (
            <div
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}>
                      <th className="text-left px-4 py-3 text-sm font-medium">
                        {t('analyze.table.ticker')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.invested')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.returned')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.realized')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.pct')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.closed_positions.map((c) => (
                      <tr
                        key={c.ticker}
                        className="border-t transition-colors hover:bg-muted/50"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <td className="px-4 py-3 font-semibold">
                          {toDisplayTicker(c.ticker, portfolio?.market ?? 'BIST')}
                        </td>
                        <td className="text-right px-4 py-3">
                          {fmt(c.total_invested)}
                        </td>
                        <td className="text-right px-4 py-3">
                          {fmt(c.total_returned)}
                        </td>
                        <td
                          className="text-right px-4 py-3 font-medium"
                          style={{ color: plColor(c.realized_pl) }}
                        >
                          {fmt(c.realized_pl)}
                        </td>
                        <td className="text-right px-4 py-3">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium"
                            style={{
                              backgroundColor: plBg(c.realized_pl_pct),
                              color: plColor(c.realized_pl_pct),
                            }}
                          >
                            {c.realized_pl_pct >= 0 ? (
                              <TrendingUp className="h-3.5 w-3.5" />
                            ) : (
                              <TrendingDown className="h-3.5 w-3.5" />
                            )}
                            {pct(c.realized_pl_pct)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Dividends ─────────────────────────────── */}
          <h2 className="text-xl font-semibold mt-8 mb-1">{t('analyze.dividends')}</h2>
          <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('analyze.dividendsHint')}
          </p>

          {analysis.dividends.receipts.length === 0 ? (
            <div
              className="rounded-lg border-2 border-dashed p-8 text-center"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <p style={{ color: 'hsl(var(--muted-foreground))' }}>
                {t('analyze.noDividends')}
              </p>
            </div>
          ) : (
            <div
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}>
                      <th className="text-left px-4 py-3 text-sm font-medium">
                        {t('analyze.table.exDate')}
                      </th>
                      <th className="text-left px-4 py-3 text-sm font-medium">
                        {t('analyze.table.ticker')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.shares')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.grossPerShare')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.gross')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.withholding')}
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium">
                        {t('analyze.table.net')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.dividends.receipts.map((d) => (
                      <tr
                        key={`${d.ticker}-${d.ex_date}`}
                        className="border-t transition-colors hover:bg-muted/50"
                        style={{ borderColor: 'hsl(var(--border))' }}
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          {fmtDate(d.ex_date)}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {displayTicker(d.ticker)}
                        </td>
                        <td className="text-right px-4 py-3">
                          {fmtNumber(d.quantity)}
                        </td>
                        <td className="text-right px-4 py-3">
                          {fmt(d.gross_per_share)}
                        </td>
                        <td className="text-right px-4 py-3">
                          {fmt(d.gross_amount)}
                        </td>
                        <td className="text-right px-4 py-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {fmtRate(d.withholding_rate)}
                        </td>
                        <td
                          className="text-right px-4 py-3 font-medium"
                          style={{ color: plColor(d.net_amount) }}
                        >
                          {fmt(d.net_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr
                      className="border-t font-semibold"
                      style={{
                        borderColor: 'hsl(var(--border))',
                        backgroundColor: 'hsl(var(--muted) / 0.3)',
                      }}
                    >
                      <td className="px-4 py-3" colSpan={4}>
                        {t('analyze.table.sum')}
                      </td>
                      <td className="text-right px-4 py-3">
                        {fmt(analysis.dividends.total_gross)}
                      </td>
                      <td />
                      <td
                        className="text-right px-4 py-3"
                        style={{ color: plColor(analysis.dividends.total_net) }}
                      >
                        {fmt(analysis.dividends.total_net)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-component ────────────────────────────────────────

function PerformanceChart({
  series,
  numberLocale,
  dateLocale,
  lineColor,
}: {
  series: PerformanceSeries;
  numberLocale: string;
  dateLocale: string;
  lineColor: string;
}) {
  const { t } = useTranslation();

  const fmtIndex = (value: number) =>
    new Intl.NumberFormat(numberLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const fmtDate = (value: string, includeYear = false) =>
    new Intl.DateTimeFormat(dateLocale, {
      day: 'numeric',
      month: 'short',
      ...(includeYear ? { year: 'numeric' } : {}),
    }).format(parseIsoDate(value));

  const fmtPct = (value: number) =>
    `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

  const chartPoints: ChartPerformancePoint[] = series.points.map((point, index) => {
    if (index === 0) {
      return { ...point, daily_pl_pct: 0 };
    }

    const previous = series.points[index - 1];
    const dailyPct =
      previous.price !== 0
        ? ((point.price / previous.price) - 1) * 100
        : 0;

    return { ...point, daily_pl_pct: dailyPct };
  });

  const rangeText =
    series.start_date && series.end_date
      ? t('analyze.chart.range', {
          start: fmtDate(series.start_date, true),
          end: fmtDate(series.end_date, true),
        })
      : t('analyze.chart.noRange');

  return (
    <section
      className="rounded-xl border p-4 md:p-5 mb-8"
      style={{
        borderColor: 'hsl(var(--border))',
        backgroundColor: 'hsl(var(--card))',
      }}
    >
      <h2 className="text-lg font-semibold mb-1">{t('analyze.chart.title')}</h2>
      <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {rangeText}
      </p>

      {series.points.length === 0 ? (
        <div
          className="rounded-lg border-2 border-dashed p-8 text-center"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <p style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('analyze.chart.noData')}
          </p>
        </div>
      ) : (
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartPoints} margin={{ top: 8, right: 16, left: 0, bottom: 28 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                minTickGap={26}
                tickFormatter={(value) => fmtDate(String(value))}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                height={56}
                label={{
                  value: t('analyze.chart.dateAxis'),
                  position: 'insideBottom',
                  offset: -4,
                  style: {
                    fill: 'hsl(var(--muted-foreground))',
                    fontSize: 12,
                  },
                }}
              />
              <YAxis
                dataKey="price"
                width={72}
                tickFormatter={(value) => fmtIndex(Number(value))}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                label={{
                  value: t('analyze.chart.priceAxis'),
                  angle: -90,
                  position: 'insideLeft',
                  style: {
                    fill: 'hsl(var(--muted-foreground))',
                    fontSize: 12,
                  },
                }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) {
                    return null;
                  }

                  const point = payload[0]?.payload as ChartPerformancePoint | undefined;
                  if (!point) {
                    return null;
                  }

                  return (
                    <div
                      className="rounded-xl border px-3 py-2 text-sm shadow-sm"
                      style={{
                        borderColor: 'hsl(var(--border))',
                        backgroundColor: 'hsl(var(--card))',
                      }}
                    >
                      <p className="font-medium mb-1">
                        {fmtDate(String(label), true)}
                      </p>
                      <p>
                        {t('analyze.chart.seriesLabel')}: {fmtIndex(point.price)}
                      </p>
                      <p style={{ color: plColor(point.daily_pl_pct) }}>
                        {t('analyze.chart.dailyPlLabel')}: {fmtPct(point.daily_pl_pct)}
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="price"
                name={t('analyze.chart.seriesLabel')}
                stroke={lineColor}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-2"
      style={{
        borderColor: 'hsl(var(--border))',
        backgroundColor: 'hsl(var(--card))',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
        >
          {icon}
        </div>
        <span
          className="text-sm"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          {label}
        </span>
      </div>
      <span className="text-2xl font-bold" style={{ color: color ?? 'hsl(var(--foreground))' }}>
        {value}
      </span>
      {sub && (
        <span className="text-sm font-medium" style={{ color }}>
          {sub}
        </span>
      )}
    </div>
  );
}
