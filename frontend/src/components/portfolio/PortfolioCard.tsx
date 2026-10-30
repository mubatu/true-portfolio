import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DailyChange } from '@/components/analysis/DailyChange';
import { plColor, type Formatters } from '@/components/analysis/format';
import { unitPrice } from '@/components/analysis/performance';
import type { AnalysisResponse } from '@/components/analysis/types';
import { ShareButton } from '@/components/explore/ShareButton';
import type { Portfolio } from '@/services/portfolioService';
import { PortfolioBadges } from './PortfolioFlags';
import { Sparkline } from './Sparkline';

/** Enough points for a smooth trend line, however long the history. */
const TREND_POINTS = 120;

/** Every nth value and always the last, so the line ends on today. */
function sample(values: number[], max: number) {
  if (values.length <= max) return values;
  const step = (values.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => values[Math.round(i * step)]);
}

/**
 * One portfolio at a glance. The whole card opens it (its analysis, or its
 * transactions while it has none). Top: name, market, trade count and its
 * labels, with share (public only) and settings. Then value and the last
 * day's change beside the total P/L, and the unit price since the start,
 * so the line's color agrees with the return.
 */
export function PortfolioCard({
  portfolio,
  analysis,
  loading,
  failed,
  onRetry,
  onSettings,
  fmt,
}: {
  portfolio: Portfolio;
  analysis: AnalysisResponse | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onSettings: () => void;
  fmt: Formatters;
}) {
  const { t } = useTranslation();
  const base = `/portfolio/${portfolio.slug}`;
  const hasTrades = (portfolio.transaction_count ?? 0) > 0;
  const points = analysis?.performance_series.points ?? [];
  const trend = sample(points.map(unitPrice), TREND_POINTS);
  const experimental = !!portfolio.is_experimental;
  // Hidden until hover or focus on wide screens; always there on touch.
  const reveal = 'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity';

  return (
    <article
      className={`group relative flex flex-col rounded-2xl border bg-card p-5 ${experimental ? 'border-dashed' : ''} shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 focus-within:shadow-md`}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-snug truncate">
            {/* Stretched link: the whole card opens the portfolio. */}
            <Link
              to={hasTrades ? `${base}/analyze` : base}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
            >
              {portfolio.name}
            </Link>
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">
              {portfolio.market} ·{' '}
              {hasTrades
                ? t('myPortfolios.card.transactions', { count: portfolio.transaction_count ?? 0 })
                : t('myPortfolios.card.noTransactions')}
            </span>
            <PortfolioBadges portfolio={portfolio} />
          </div>
        </div>

        <div className="relative z-10 -mr-2 -mt-1 flex items-center shrink-0">
          {portfolio.is_public && hasTrades && (
            <ShareButton slug={portfolio.slug} name={portfolio.name} className={reveal} />
          )}
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${reveal}`}
            aria-label={t('portfolioSettings.title')}
            title={t('portfolioSettings.title')}
            onClick={onSettings}
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </header>

      {!hasTrades ? (
        <div className="mt-5 flex flex-1 flex-col justify-between gap-4">
          <p className="text-sm text-muted-foreground">{t('myPortfolios.noTrades')}</p>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            {t('myPortfolios.card.addFirst')}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      ) : loading ? (
        <div className="mt-5 flex flex-1 flex-col gap-4" aria-busy="true">
          <div className="h-14 w-2/3 rounded-lg bg-muted animate-pulse" />
          <div className="h-12 rounded-lg bg-muted animate-pulse" />
        </div>
      ) : failed || !analysis ? (
        <div className="mt-5 flex-1 text-sm text-muted-foreground">
          {t('analyze.loadError')}{' '}
          <button type="button" onClick={onRetry} className="relative z-10 underline text-foreground">
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <>
          <dl className="mt-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t('analyze.fund.size')}</dt>
              <dd className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">
                {fmt.money(analysis.totals.portfolio_value + analysis.totals.in_the_safe)}
              </dd>
              <dd className="mt-1.5">
                <DailyChange points={points} fmt={fmt} size="sm" />
              </dd>
            </div>
            <div className="shrink-0 text-right">
              <dt className="text-xs text-muted-foreground">{t('analyze.totalPl')}</dt>
              <dd
                className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight"
                style={{ color: plColor(analysis.totals.total_pl) }}
              >
                {fmt.signedMoney(analysis.totals.total_pl)}
              </dd>
              <dd className="mt-1 text-sm font-medium tabular-nums" style={{ color: plColor(analysis.totals.total_pl) }}>
                {fmt.pct(analysis.totals.total_pl_pct)}
              </dd>
            </div>
          </dl>
          <div className="mt-auto pt-4">
            <Sparkline values={trend} height={52} label={t('myPortfolios.trendLabel')} />
          </div>
        </>
      )}
    </article>
  );
}
