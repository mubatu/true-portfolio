import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ListOrdered, Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { plBg, plColor, type Formatters } from '@/components/analysis/format';
import { dailyReturns, unitPrice } from '@/components/analysis/performance';
import type { AnalysisResponse } from '@/components/analysis/types';
import type { Portfolio } from '@/services/portfolioService';
import { Sparkline } from './Sparkline';

/**
 * One portfolio at a glance: unit-price sparkline, value, P/L and daily
 * change, with links to its analysis and transactions and its own actions.
 */
export function PortfolioCard({
  portfolio,
  analysis,
  loading,
  failed,
  onRetry,
  onRename,
  onDelete,
  fmt,
}: {
  portfolio: Portfolio;
  analysis: AnalysisResponse | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onRename: () => void;
  onDelete: () => void;
  fmt: Formatters;
}) {
  const { t } = useTranslation();
  const base = `/portfolio/${portfolio.slug}`;
  const hasTrades = (portfolio.transaction_count ?? 0) > 0;
  const points = analysis?.performance_series.points ?? [];
  const daily = points.length >= 2 ? dailyReturns(points.slice(-2))[1] : null;
  const recent = points.slice(-90).map(unitPrice);

  return (
    <article
      className="group relative rounded-2xl border bg-card p-5 flex flex-col gap-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 focus-within:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-lg truncate">
            {/* Stretched link: the whole card opens the portfolio. */}
            <Link
              to={hasTrades ? `${base}/analyze` : base}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
            >
              {portfolio.name}
            </Link>
          </h2>
          <p className="text-xs text-muted-foreground">
            {portfolio.market} ·{' '}
            {hasTrades
              ? t('myPortfolios.card.transactions', { count: portfolio.transaction_count ?? 0 })
              : t('myPortfolios.card.noTransactions')}
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-1 shrink-0">
          {daily != null && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums mr-1"
              style={{ backgroundColor: plBg(daily), color: plColor(daily) }}
              title={t('myPortfolios.dailyChange')}
            >
              {daily >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {fmt.pct(daily)}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
            aria-label={t('myPortfolios.edit.title')}
            title={t('myPortfolios.edit.title')}
            onClick={onRename}
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
            aria-label={t('portfolio.deleteConfirm.title')}
            title={t('portfolio.deleteConfirm.title')}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {!hasTrades ? (
        <p className="text-sm text-muted-foreground flex-1">{t('myPortfolios.noTrades')}</p>
      ) : loading ? (
        <div className="space-y-3 flex-1" aria-busy="true">
          <div className="h-11 rounded-lg bg-muted animate-pulse" />
          <div className="h-10 w-2/3 rounded-lg bg-muted animate-pulse" />
        </div>
      ) : failed || !analysis ? (
        <div className="flex-1 text-sm text-muted-foreground">
          {t('analyze.loadError')}{' '}
          <button type="button" onClick={onRetry} className="relative z-10 underline text-foreground">
            {t('common.retry')}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3">
          <Sparkline values={recent} label={t('myPortfolios.sparklineLabel')} />
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t('analyze.fund.size')}</dt>
              <dd className="font-semibold tabular-nums">
                {fmt.money(analysis.totals.portfolio_value + analysis.totals.in_the_safe)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('analyze.totalPl')}</dt>
              <dd className="font-semibold tabular-nums" style={{ color: plColor(analysis.totals.total_pl) }}>
                {fmt.signedMoney(analysis.totals.total_pl)}{' '}
                <span className="text-xs">({fmt.pct(analysis.totals.total_pl_pct)})</span>
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="relative z-10 flex items-center gap-2 pt-1">
        {hasTrades && (
          <Link to={`${base}/analyze`}>
            <Button size="sm" className="gap-1.5">
              {t('portfolio.tabs.analysis')}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        )}
        <Link to={base}>
          <Button size="sm" variant="outline" className="gap-1.5">
            <ListOrdered className="h-3.5 w-3.5" />
            {hasTrades ? t('portfolio.tabs.transactions') : t('portfolio.addTransaction')}
          </Button>
        </Link>
      </div>
    </article>
  );
}
