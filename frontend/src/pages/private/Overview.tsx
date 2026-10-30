import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Briefcase, FlaskConical, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoNote } from '@/components/ui/Panel';
import { AllocationChart } from '@/components/analysis/AllocationChart';
import { AnalysisSkeleton } from '@/components/analysis/AnalysisSkeleton';
import { FundChart, type PortfolioLine } from '@/components/analysis/FundChart';
import { FundOverview } from '@/components/analysis/FundOverview';
import { Insights } from '@/components/analysis/Insights';
import { ReturnsTable } from '@/components/analysis/ReturnsTable';
import { useFormatters } from '@/components/analysis/format';
import { categoricalColors } from '@/components/analysis/palette';
import type { RangeKey } from '@/components/analysis/performance';
import type { AnalysisResponse } from '@/components/analysis/types';
import { PortfolioBreakdownTable } from '@/components/overview/PortfolioBreakdownTable';
import {
  combineDividends,
  combineSeries,
  combineTotals,
  portfolioRows,
  rowsAsPositions,
} from '@/components/overview/combine';
import { useTheme } from '@/hooks/useTheme';
import { analyzePortfolio, getPortfolios } from '@/services/portfolioService';

/**
 * All of the user's portfolios read as one fund, laid out like a single
 * portfolio's analysis: per-portfolio P/L instead of per-stock, and the
 * allocation across portfolios. Portfolios marked experimental are left
 * out. Every market is in TL today, so the money adds up directly.
 * Analyses come from the same cache as the portfolio pages.
 */
export function Overview() {
  const { t } = useTranslation();
  const fmt = useFormatters('TRY');
  const [range, setRange] = useState<RangeKey>('ALL');
  const { theme } = useTheme();

  useDocumentTitle(t('overview.title'));

  const portfoliosQuery = useQuery({ queryKey: ['portfolios'], queryFn: getPortfolios });
  const portfolios = portfoliosQuery.data;

  const { included, experimentalCount } = useMemo(() => {
    const all = portfolios ?? [];
    return {
      included: all.filter((p) => !p.is_experimental && (p.transaction_count ?? 0) > 0),
      experimentalCount: all.filter((p) => p.is_experimental).length,
    };
  }, [portfolios]);

  // Stable, so the combined result only changes when a query result does.
  const collect = useCallback(
    (results: UseQueryResult<AnalysisResponse>[]) => ({
      data: results.map((r) => r.data),
      loading: results.some((r) => r.isLoading),
      fetching: results.some((r) => r.isFetching),
      failed: results.map((r, i) => (r.isError ? i : -1)).filter((i) => i >= 0),
      errors: results.map((r) => r.error).filter(Boolean) as Error[],
      refetch: () => results.forEach((r) => r.refetch()),
    }),
    []
  );
  const analyses = useQueries({
    queries: included.map((p) => ({
      queryKey: ['portfolio-analysis', p.id],
      queryFn: () => analyzePortfolio(p.id),
    })),
    combine: collect,
  });

  const overview = useMemo(() => {
    const items = included.flatMap((portfolio, i) => {
      const analysis = analyses.data[i];
      return analysis ? [{ portfolio, analysis }] : [];
    });
    if (items.length === 0 || items.length !== included.length) return null;
    const rows = portfolioRows(items);
    // The same color for a portfolio in the allocation donut and its chart line.
    const colorOf = categoricalColors(rows.map((r) => String(r.id)), theme === 'dark' ? 'dark' : 'light');
    // Largest weight first, the order of the breakdown table.
    const analysisOf = new Map(items.map((x) => [x.portfolio.id, x.analysis]));
    const lines: PortfolioLine[] = rows.map((r) => ({
      key: String(r.id),
      label: r.name,
      color: colorOf.get(String(r.id))!,
      twrByDate: new Map(analysisOf.get(r.id)!.performance_series.points.map((p) => [p.date, p.twr_pct])),
    }));
    return {
      points: combineSeries(items.map((x) => x.analysis.performance_series.points)),
      totals: combineTotals(items.map((x) => x.analysis.totals)),
      dividends: combineDividends(items.map((x) => x.analysis.dividends)),
      rows,
      positions: rowsAsPositions(rows),
      nameOf: new Map(rows.map((r) => [String(r.id), r.name])),
      colorOf,
      lines,
    };
  }, [included, analyses.data, theme]);

  const portfolioName = useCallback((id: string) => overview?.nameOf.get(id) ?? id, [overview]);
  const loading = portfoliosQuery.isLoading || analyses.loading;
  const failedNames = analyses.failed.map((i) => included[i]?.name).filter(Boolean);

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t('overview.title')}</h1>
          <p className="hidden sm:block text-sm mt-1 text-muted-foreground">{t('overview.subtitle')}</p>
          {included.length > 0 && experimentalCount > 0 && (
            <Link
              to="/my-portfolios"
              className="inline-flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              {t('overview.experimentalExcluded', { count: experimentalCount })}
            </Link>
          )}
        </div>
        {overview && (
          <Button
            variant="outline"
            className="gap-1.5 self-start sm:self-auto"
            onClick={analyses.refetch}
            disabled={analyses.fetching}
            aria-label={t('analyze.refresh')}
          >
            <RefreshCw className={`h-4 w-4 ${analyses.fetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('analyze.refresh')}</span>
          </Button>
        )}
      </header>

      {loading && <AnalysisSkeleton />}

      {!loading && (portfoliosQuery.error || failedNames.length > 0) && (
        <div
          className="rounded-xl border p-6 text-center mb-6"
          style={{ borderColor: 'hsl(var(--destructive) / 0.5)', backgroundColor: 'hsl(var(--destructive) / 0.06)' }}
          role="alert"
        >
          <p className="font-medium mb-1" style={{ color: 'hsl(var(--destructive))' }}>
            {portfoliosQuery.error
              ? t('common.error')
              : t('overview.loadError', { names: failedNames.join(', ') })}
          </p>
          <p className="text-sm mb-4 text-muted-foreground">
            {((portfoliosQuery.error as Error | null) ?? analyses.errors[0])?.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (portfoliosQuery.error ? portfoliosQuery.refetch() : analyses.refetch())}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}

      {!loading && portfolios && included.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed p-10 text-center" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-primary/10">
            <Briefcase className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-1">{t('overview.empty.title')}</h2>
          <p className="text-sm mb-5 max-w-md mx-auto text-muted-foreground">
            {t(experimentalCount > 0 ? 'overview.empty.allExperimental' : 'overview.empty.description')}
          </p>
          <Link to="/my-portfolios">
            <Button>{t('common.myPortfolios')}</Button>
          </Link>
        </div>
      )}

      {overview && !loading && (
        <>
          <FundOverview points={overview.points} totals={overview.totals} dividends={overview.dividends} fmt={fmt} />
          <FundChart
            points={overview.points}
            fmt={fmt}
            range={range}
            onRangeChange={setRange}
            portfolioLines={overview.lines}
          />
          <Insights
            points={overview.points}
            positions={overview.positions}
            fmt={fmt}
            displayTicker={portfolioName}
            kind="portfolio"
          />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] mb-6 items-start [&>*]:min-w-0">
            <ReturnsTable points={overview.points} fmt={fmt} range={range} />
            <AllocationChart
              positions={overview.positions}
              cash={0}
              fmt={fmt}
              displayTicker={portfolioName}
              title={t('overview.allocation')}
              colorOf={overview.colorOf}
            />
          </div>
          <PortfolioBreakdownTable rows={overview.rows} totals={overview.totals} fmt={fmt} />
          <InfoNote className="mt-8">{t('overview.footnote')}</InfoNote>
        </>
      )}
    </div>
  );
}
