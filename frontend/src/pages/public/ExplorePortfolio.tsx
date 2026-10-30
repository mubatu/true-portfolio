import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { ArrowRight, ChevronLeft, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/Panel';
import { AllocationChart } from '@/components/analysis/AllocationChart';
import { AnalysisSkeleton } from '@/components/analysis/AnalysisSkeleton';
import { DailyChange } from '@/components/analysis/DailyChange';
import { FundChart } from '@/components/analysis/FundChart';
import { ReturnsTable } from '@/components/analysis/ReturnsTable';
import { plColor, useFormatters } from '@/components/analysis/format';
import { unitPrice, type RangeKey } from '@/components/analysis/performance';
import { OwnerChip } from '@/components/explore/ExploreParts';
import { ShareButton } from '@/components/explore/ShareButton';
import { useHorizon } from '@/components/explore/useHorizon';
import { allocationAsPositions, toPerformancePoints } from '@/components/explore/publicData';
import { ExperimentalBadge } from '@/components/portfolio/PortfolioFlags';
import { toDisplayTicker } from '@/config';
import { useAuth } from '@/hooks/useAuth';
import { getPublicPortfolio } from '@/lib/api';
import { getPortfolios } from '@/services/portfolioService';

/**
 * One public portfolio as everyone sees it: unit price chart, returns and
 * current allocation, all in percentages. Its owner gets a link to their
 * full analysis.
 */
export function ExplorePortfolio() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const fmt = useFormatters('TRY');
  const horizonOf = useHorizon(fmt);
  const { isAuthenticated } = useAuth();
  const [range, setRange] = useState<RangeKey>('ALL');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['explore', slug],
    queryFn: () => getPublicPortfolio(slug!),
    enabled: !!slug,
    retry: (count, e) => !(isAxiosError(e) && e.response?.status === 404) && count < 1,
  });
  // The owner's own portfolios (signed in only), to offer the full analysis.
  const own = useQuery({ queryKey: ['portfolios'], queryFn: getPortfolios, enabled: isAuthenticated });
  const isMine = isAuthenticated && !!own.data?.some((p) => p.slug === slug);

  const points = useMemo(() => toPerformancePoints(data?.points ?? []), [data]);
  const positions = useMemo(() => (data ? allocationAsPositions(data.allocation) : []), [data]);
  const displayTicker = (ticker: string) => toDisplayTicker(ticker, data?.market ?? 'BIST');

  useEffect(() => {
    if (data?.name) document.title = `${data.name} · ${t('explore.title')} · ${t('common.appName')}`;
  }, [data?.name, t]);

  const notFound = isAxiosError(error) && error.response?.status === 404;
  const last = points[points.length - 1];

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      <Link
        to="/explore"
        className="inline-flex items-center gap-1 text-sm mb-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('explore.title')}
      </Link>

      {isLoading && <AnalysisSkeleton />}

      {error && (
        <div
          className="rounded-xl border p-6 text-center mt-4"
          style={{ borderColor: 'hsl(var(--destructive) / 0.5)', backgroundColor: 'hsl(var(--destructive) / 0.06)' }}
          role="alert"
        >
          <p className="font-medium mb-3" style={{ color: 'hsl(var(--destructive))' }}>
            {t(notFound ? 'explore.notFound' : 'explore.loadError')}
          </p>
          {notFound ? (
            <Link to="/explore">
              <Button variant="outline" size="sm">{t('explore.backToList')}</Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t('common.retry')}
            </Button>
          )}
        </div>
      )}

      {data && (
        <>
          <header className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{data.name}</h1>
                <span className="rounded-md border bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {data.market}
                </span>
                {data.is_experimental && <ExperimentalBadge />}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                <OwnerChip owner={data.owner} size="md" />
                <span className="text-sm text-muted-foreground">{horizonOf(data.start_date, data.end_date)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <ShareButton slug={data.slug} name={data.name} variant="labelled" />
              {isMine && (
                <Link to={`/portfolio/${slug}/analyze`}>
                  <Button variant="outline" className="gap-1.5">
                    {t('explore.openMine')}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </header>

          {last && (
            <Panel className="p-5 md:p-6 mb-6 flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('analyze.fund.unitPrice')}</p>
                <div className="flex flex-wrap items-baseline gap-3 mt-1">
                  <span className="text-4xl font-bold tabular-nums tracking-tight">{fmt.unit(unitPrice(last))}</span>
                  <DailyChange points={points} fmt={fmt} />
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('explore.sinceStart')}</p>
                <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: plColor(last.twr_pct) }}>
                  {fmt.pct(last.twr_pct)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground max-w-sm basis-full md:basis-auto md:ml-auto inline-flex gap-1.5">
                <EyeOff className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
                {t('explore.amountsHiddenDetail')}
              </p>
            </Panel>
          )}

          <FundChart points={points} fmt={fmt} range={range} onRangeChange={setRange} hideAmounts />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] mb-6 items-start [&>*]:min-w-0">
            <ReturnsTable points={points} fmt={fmt} range={range} hideAmounts />
            <AllocationChart
              positions={positions}
              cash={data.allocation.cash_pct}
              fmt={fmt}
              displayTicker={displayTicker}
              title={t('explore.allocation')}
              hideAmounts
            />
          </div>
        </>
      )}
    </div>
  );
}
