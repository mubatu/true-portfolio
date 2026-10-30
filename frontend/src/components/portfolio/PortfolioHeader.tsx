import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, LineChart, ListOrdered, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/explore/ShareButton';
import { getPortfolios, type Portfolio } from '@/services/portfolioService';
import { PortfolioSettingsDialog } from './PortfolioDialogs';
import { PortfolioBadges } from './PortfolioFlags';

/**
 * Shared header of a portfolio's pages, in three layers:
 * - name, then market, trade count and labels as on its My Portfolios card;
 * - actions on the whole portfolio (share when public, settings), top right;
 * - the Analysis / Transactions tabs, with the open page's own action
 *   (``actions``: refresh, add a trade) at the right end of the tab bar.
 */
export function PortfolioHeader({
  portfolio,
  actions,
}: {
  portfolio: Portfolio | null | undefined;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const base = portfolio ? `/portfolio/${portfolio.slug}` : '';

  // The list carries the trade count (the single portfolio does not); it
  // is cached from My Portfolios and refreshed whenever trades change.
  const list = useQuery({ queryKey: ['portfolios'], queryFn: getPortfolios, enabled: !!portfolio });
  const trades = list.data?.find((p) => p.id === portfolio?.id)?.transaction_count;

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-sm ${
      isActive
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
    }`;

  return (
    <header className="mb-6">
      <Link
        to="/my-portfolios"
        className="inline-flex items-center gap-1 text-sm mb-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('common.myPortfolios')}
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">
            {portfolio?.name ?? <span className="inline-block h-8 w-48 rounded-md bg-muted animate-pulse" />}
          </h1>
          {portfolio && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="whitespace-nowrap">
                {portfolio.market}
                {trades != null &&
                  ` · ${trades > 0 ? t('myPortfolios.card.transactions', { count: trades }) : t('myPortfolios.card.noTransactions')}`}
              </span>
              <PortfolioBadges portfolio={portfolio} />
            </div>
          )}
        </div>

        {portfolio && (
          <div className="flex items-center gap-1 shrink-0 -mr-2">
            {/* Explore lists a public portfolio once it has trades. */}
            {portfolio.is_public && (trades ?? 0) > 0 && (
              <ShareButton slug={portfolio.slug} name={portfolio.name} variant="labelled-ghost" />
            )}
            <Button
              variant="ghost"
              className="gap-1.5"
              onClick={() => setSettingsOpen(true)}
              aria-label={t('portfolioSettings.title')}
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">{t('portfolioSettings.short')}</span>
            </Button>
          </div>
        )}
      </div>

      {portfolio && (
        <div className="mt-5 flex items-end justify-between gap-3 border-b">
          <nav className="flex gap-6 -mb-px" aria-label={t('portfolio.tabs.label')}>
            <NavLink to={`${base}/analyze`} className={tabClass}>
              <LineChart className="h-4 w-4" aria-hidden="true" />
              {t('portfolio.tabs.analysis')}
            </NavLink>
            <NavLink to={base} end className={tabClass}>
              <ListOrdered className="h-4 w-4" aria-hidden="true" />
              {t('portfolio.tabs.transactions')}
            </NavLink>
          </nav>
          {actions && <div className="flex items-center gap-2 pb-2 shrink-0">{actions}</div>}
        </div>
      )}

      {settingsOpen && portfolio && (
        <PortfolioSettingsDialog
          portfolio={portfolio}
          onClose={() => setSettingsOpen(false)}
          onDeleted={() => navigate('/my-portfolios', { replace: true })}
        />
      )}
    </header>
  );
}
