import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analyzePortfolio, getPortfolioBySlug } from '@/services/portfolioService';
import { getMarketCurrency, toDisplayTicker } from '@/config';
import { AllocationChart } from '@/components/analysis/AllocationChart';
import { DividendsTable } from '@/components/analysis/DividendsTable';
import { FundChart } from '@/components/analysis/FundChart';
import { FundOverview } from '@/components/analysis/FundOverview';
import { Insights } from '@/components/analysis/Insights';
import { PositionsTable } from '@/components/analysis/PositionsTable';
import { ReturnsTable } from '@/components/analysis/ReturnsTable';
import { AnalysisSkeleton } from '@/components/analysis/AnalysisSkeleton';
import { useFormatters } from '@/components/analysis/format';
import type { RangeKey } from '@/components/analysis/performance';
import type { AnalysisWarning } from '@/components/analysis/types';
import { PortfolioHeader } from '@/components/portfolio/PortfolioHeader';

export function PortfolioAnalyze() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  // The chart's period, also used by the returns table.
  const [range, setRange] = useState<RangeKey>('ALL');

  const portfolioQuery = useQuery({
    queryKey: ['portfolio', slug],
    queryFn: () => getPortfolioBySlug(slug!),
    enabled: !!slug,
  });
  const portfolio = portfolioQuery.data;

  const analysisQuery = useQuery({
    queryKey: ['portfolio-analysis', portfolio?.id],
    queryFn: () => analyzePortfolio(portfolio!.id),
    enabled: !!portfolio?.id,
  });
  const analysis = analysisQuery.data;

  const market = portfolio?.market ?? 'BIST';
  const fmt = useFormatters(getMarketCurrency(market));
  const displayTicker = (ticker: string) => toDisplayTicker(ticker, market);

  useDocumentTitle(portfolio?.name && `${portfolio.name} · ${t('portfolio.tabs.analysis')}`);

  const error = portfolioQuery.error ?? analysisQuery.error;
  const loading = portfolioQuery.isLoading || analysisQuery.isLoading;
  const points = analysis?.performance_series.points ?? [];
  const hasTrades = (analysis?.positions.length ?? 0) > 0;

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      <PortfolioHeader
        portfolio={portfolio}
        actions={
          analysis && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => analysisQuery.refetch()}
              disabled={analysisQuery.isFetching}
              aria-label={t('analyze.refresh')}
            >
              <RefreshCw className={`h-4 w-4 ${analysisQuery.isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('analyze.refresh')}</span>
            </Button>
          )
        }
      />

      {loading && <AnalysisSkeleton />}

      {error && !loading && (
        <div
          className="rounded-xl border p-6 text-center"
          style={{ borderColor: 'hsl(var(--destructive) / 0.5)', backgroundColor: 'hsl(var(--destructive) / 0.06)' }}
          role="alert"
        >
          <p className="font-medium mb-1" style={{ color: 'hsl(var(--destructive))' }}>
            {t('analyze.loadError')}
          </p>
          <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {(error as Error).message}
          </p>
          <Button variant="outline" size="sm" onClick={() => (portfolio ? analysisQuery.refetch() : portfolioQuery.refetch())}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {analysis && !loading && !hasTrades && (
        <div className="rounded-2xl border-2 border-dashed p-10 text-center" style={{ borderColor: 'hsl(var(--border))' }}>
          <h2 className="text-lg font-semibold mb-1">{t('analyze.empty.title')}</h2>
          <p className="text-sm mb-5 max-w-md mx-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('analyze.empty.description')}
          </p>
          <Link to={`/portfolio/${slug}`}>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {t('portfolio.addTransaction')}
            </Button>
          </Link>
        </div>
      )}

      {analysis && !loading && hasTrades && (
        <>
          <Warnings warnings={analysis.warnings} displayTicker={displayTicker} />
          <FundOverview points={points} totals={analysis.totals} dividends={analysis.dividends} fmt={fmt} />
          <FundChart points={points} fmt={fmt} range={range} onRangeChange={setRange} />
          <Insights points={points} positions={analysis.positions} fmt={fmt} displayTicker={displayTicker} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] mb-6 items-start [&>*]:min-w-0">
            <ReturnsTable points={points} fmt={fmt} range={range} />
            <AllocationChart
              positions={analysis.positions}
              cash={analysis.totals.in_the_safe}
              fmt={fmt}
              displayTicker={displayTicker}
            />
          </div>
          <PositionsTable positions={analysis.positions} fmt={fmt} displayTicker={displayTicker} />
          <DividendsTable dividends={analysis.dividends} fmt={fmt} displayTicker={displayTicker} />
          <p className="text-xs mt-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('analyze.subtitle')}
          </p>
        </>
      )}
    </div>
  );
}

function Warnings({
  warnings,
  displayTicker,
}: {
  warnings: AnalysisWarning[];
  displayTicker: (ticker: string) => string;
}) {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;

  return (
    <div
      className="rounded-xl border p-4 mb-6 flex gap-3"
      style={{ borderColor: 'hsl(var(--warning) / 0.6)', backgroundColor: 'hsl(var(--warning) / 0.1)' }}
      role="status"
    >
      <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: 'hsl(var(--warning))' }} />
      <div className="text-sm">
        <p className="font-medium mb-1">{t('analyze.warnings.title')}</p>
        <ul className="list-disc pl-4">
          {warnings.map((w) => (
            <li key={`${w.code}-${w.ticker}`}>
              {t(`analyze.warnings.${w.code}`, { ticker: displayTicker(w.ticker) })}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
