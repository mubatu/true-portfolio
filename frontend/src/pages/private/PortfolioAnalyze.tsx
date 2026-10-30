import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analyzePortfolio, getPortfolioBySlug } from '@/services/portfolioService';
import { getMarketCurrency, toDisplayTicker } from '@/config';
import { useFormatters } from '@/components/analysis/format';
import { MonthlyTable } from '@/components/analysis/MonthlyTable';
import { PerformanceSection } from '@/components/analysis/PerformanceSection';
import {
  ClosedPositionsTable,
  DividendsTable,
  HoldingsTable,
} from '@/components/analysis/PositionTables';
import { SummaryCards } from '@/components/analysis/SummaryCards';
import type { AnalysisWarning } from '@/components/analysis/types';

export function PortfolioAnalyze() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
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
  } = useQuery({
    queryKey: ['portfolio-analysis', portfolio?.id],
    queryFn: () => analyzePortfolio(portfolio!.id),
    enabled: !!portfolio?.id,
  });

  const isLoading = isPortfolioLoading || isAnalysisLoading;
  const market = portfolio?.market ?? 'BIST';
  const fmt = useFormatters(getMarketCurrency(market));
  const displayTicker = (ticker: string) => toDisplayTicker(ticker, market);

  return (
    <div className="container mx-auto px-4 py-8">
      <Button variant="ghost" size="sm" className="gap-1 mb-6" onClick={() => navigate('/dashboard')}>
        <ArrowLeft className="h-4 w-4" />
        {t('analyze.backToDashboard')}
      </Button>

      <h1 className="text-3xl font-bold mb-2">
        {portfolio?.name ? t('analyze.title', { name: portfolio.name }) : t('common.dashboard')}
      </h1>
      <p className="text-sm mb-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {t('analyze.subtitle')}
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

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

      {!isLoading && analysis && (
        <>
          <Warnings warnings={analysis.warnings} displayTicker={displayTicker} />
          <SummaryCards totals={analysis.totals} dividends={analysis.dividends} fmt={fmt} />
          <PerformanceSection points={analysis.performance_series.points} fmt={fmt} />
          <MonthlyTable points={analysis.performance_series.points} fmt={fmt} />
          <HoldingsTable holdings={analysis.current_holdings} fmt={fmt} displayTicker={displayTicker} />
          <ClosedPositionsTable positions={analysis.closed_positions} fmt={fmt} displayTicker={displayTicker} />
          <DividendsTable dividends={analysis.dividends} fmt={fmt} displayTicker={displayTicker} />
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
      className="rounded-lg border p-4 mb-6 flex gap-3"
      style={{ borderColor: 'hsl(38 92% 50%)', backgroundColor: 'hsl(38 92% 50% / 0.1)' }}
    >
      <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: 'hsl(38 92% 40%)' }} />
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
