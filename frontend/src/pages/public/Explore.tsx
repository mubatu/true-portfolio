import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Compass, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/components/analysis/format';
import { ExploreCard } from '@/components/explore/ExploreParts';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getPublicPortfolios } from '@/lib/api';

/**
 * Explore: portfolios their owners made public, open to everyone, signed
 * in or not. Only percentages are shown (the API sends nothing else).
 */
export function Explore() {
  const { t } = useTranslation();
  const fmt = useFormatters('TRY');
  const { isAuthenticated } = useAuth();

  useDocumentTitle(t('explore.title'));

  const { data: portfolios, isLoading, error, refetch } = useQuery({
    queryKey: ['explore'],
    queryFn: getPublicPortfolios,
  });

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t('explore.title')}</h1>
        <p className="hidden sm:block text-sm mt-1 text-muted-foreground max-w-2xl">{t('explore.subtitle')}</p>
        <p className="text-xs mt-2 inline-flex items-center gap-1.5 text-muted-foreground">
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          {t('explore.amountsHidden')}
        </p>
      </header>

      {error ? (
        <div
          className="rounded-xl border p-6 text-center"
          style={{ borderColor: 'hsl(var(--destructive) / 0.5)', backgroundColor: 'hsl(var(--destructive) / 0.06)' }}
          role="alert"
        >
          <p className="font-medium mb-3" style={{ color: 'hsl(var(--destructive))' }}>
            {t('explore.loadError')}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-72 rounded-2xl border bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : !portfolios?.length ? (
        <div className="rounded-2xl border-2 border-dashed p-12 text-center">
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-primary/10">
            <Compass className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-1">{t('explore.empty.title')}</h2>
          <p className="text-sm mb-5 max-w-sm mx-auto text-muted-foreground">{t('explore.empty.description')}</p>
          <Link to={isAuthenticated ? '/my-portfolios' : '/auth'}>
            <Button>{isAuthenticated ? t('common.myPortfolios') : t('common.getStarted')}</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {portfolios.map((p) => (
            <ExploreCard key={p.slug} portfolio={p} fmt={fmt} />
          ))}
        </div>
      )}
    </div>
  );
}
