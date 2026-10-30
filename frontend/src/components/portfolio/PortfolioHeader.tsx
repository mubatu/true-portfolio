import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, LineChart, ListOrdered } from 'lucide-react';
import type { Portfolio } from '@/services/portfolioService';

/**
 * Shared header of a portfolio's pages: back link, name, market and the
 * Analysis / Transactions tabs, with page-specific actions on the right.
 */
export function PortfolioHeader({
  portfolio,
  actions,
}: {
  portfolio: Pick<Portfolio, 'name' | 'market' | 'slug'> | null | undefined;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const base = portfolio ? `/portfolio/${portfolio.slug}` : '';

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 px-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
      isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
    }`;

  return (
    <header className="mb-6">
      <Link
        to="/my-portfolios"
        className="inline-flex items-center gap-1 text-sm mb-3 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('common.myPortfolios')}
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">
            {portfolio?.name ?? <span className="inline-block h-8 w-48 rounded-md bg-muted animate-pulse" />}
          </h1>
          {portfolio && (
            <span className="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
              {portfolio.market}
            </span>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {portfolio && (
        <nav className="flex gap-6 border-b border-border" aria-label={t('portfolio.tabs.label')}>
          <NavLink to={`${base}/analyze`} className={tabClass}>
            <LineChart className="h-4 w-4" />
            {t('portfolio.tabs.analysis')}
          </NavLink>
          <NavLink to={base} end className={tabClass}>
            <ListOrdered className="h-4 w-4" />
            {t('portfolio.tabs.transactions')}
          </NavLink>
        </nav>
      )}
    </header>
  );
}
