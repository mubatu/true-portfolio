import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, LineChart, ListOrdered } from 'lucide-react';
import type { Portfolio } from '@/services/portfolioService';

/**
 * Shared header of a portfolio's pages: back link, name and market on the
 * left; the Analysis / Transactions switch and page-specific actions on
 * the right (below the title on small screens).
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
    `flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
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

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">
            {portfolio?.name ?? <span className="inline-block h-8 w-48 rounded-md bg-muted animate-pulse" />}
          </h1>
          {portfolio && (
            <span className="shrink-0 rounded-md border bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {portfolio.market}
            </span>
          )}
        </div>

        {portfolio && (
          <div className="flex items-center gap-2">
            <nav
              className="flex flex-1 md:flex-none rounded-xl border bg-muted/60 p-[3px] gap-1"
              aria-label={t('portfolio.tabs.label')}
            >
              <NavLink to={`${base}/analyze`} className={tabClass}>
                <LineChart className="h-4 w-4" aria-hidden="true" />
                {t('portfolio.tabs.analysis')}
              </NavLink>
              <NavLink to={base} end className={tabClass}>
                <ListOrdered className="h-4 w-4" aria-hidden="true" />
                {t('portfolio.tabs.transactions')}
              </NavLink>
            </nav>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </div>
        )}
      </div>
    </header>
  );
}
