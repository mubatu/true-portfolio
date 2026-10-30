import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Briefcase, FlaskConical, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/components/analysis/format';
import { PortfolioCard } from '@/components/portfolio/PortfolioCard';
import { CreatePortfolioDialog, PortfolioSettingsDialog } from '@/components/portfolio/PortfolioDialogs';
import { analyzePortfolio, getPortfolios, type Portfolio } from '@/services/portfolioService';

type Dialog = { kind: 'create' } | { kind: 'settings'; portfolio: Portfolio } | null;

/**
 * Every portfolio at a glance, the way into it, and creating one or
 * changing its settings (name, public / private, experimental, delete).
 * Experimental portfolios sit in their own section and are left out of
 * the Overview.
 * Cards load their analysis into the same cache the analysis page uses,
 * so opening a portfolio from here is instant.
 */
export function MyPortfolios() {
  const { t } = useTranslation();
  const fmt = useFormatters('TRY');
  const [dialog, setDialog] = useState<Dialog>(null);

  useDocumentTitle(t('myPortfolios.title'));

  const { data: portfolios = [], isLoading, error, refetch } = useQuery({
    queryKey: ['portfolios'],
    queryFn: getPortfolios,
  });

  const withTrades = portfolios.filter((p) => (p.transaction_count ?? 0) > 0);
  const analyses = useQueries({
    queries: withTrades.map((p) => ({
      queryKey: ['portfolio-analysis', p.id],
      queryFn: () => analyzePortfolio(p.id),
    })),
  });
  const analysisById = new Map(withTrades.map((p, i) => [p.id, analyses[i]]));

  // Largest first; portfolios without a value yet (loading, no trades) keep
  // their order at the end. Array.sort is stable.
  const valueOf = (p: Portfolio) => {
    const a = analysisById.get(p.id)?.data;
    return a ? a.totals.portfolio_value + a.totals.in_the_safe : null;
  };
  const sorted = [...portfolios].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va == null || vb == null) return (va == null ? 1 : 0) - (vb == null ? 1 : 0);
    return vb - va;
  });
  const regular = sorted.filter((p) => !p.is_experimental);
  const experimental = sorted.filter((p) => p.is_experimental);

  const renderCards = (list: Portfolio[]) => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((p) => {
        const q = analysisById.get(p.id);
        return (
          <PortfolioCard
            key={p.id}
            portfolio={p}
            analysis={q?.data}
            loading={!!q?.isLoading}
            failed={!!q?.isError}
            onRetry={() => q?.refetch()}
            onSettings={() => setDialog({ kind: 'settings', portfolio: p })}
            fmt={fmt}
          />
        );
      })}
    </div>
  );

  const createButton = (
    <Button onClick={() => setDialog({ kind: 'create' })} className="gap-2">
      <Plus className="h-4 w-4" />
      {t('myPortfolios.createNew')}
    </Button>
  );

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{t('myPortfolios.title')}</h1>
          <p className="text-sm mt-1 text-muted-foreground">{t('myPortfolios.subtitle')}</p>
        </div>
        {portfolios.length > 0 && createButton}
      </div>

      {error ? (
        <div
          className="rounded-xl border p-6 text-center"
          style={{ borderColor: 'hsl(var(--destructive) / 0.5)', backgroundColor: 'hsl(var(--destructive) / 0.06)' }}
          role="alert"
        >
          <p className="font-medium mb-3" style={{ color: 'hsl(var(--destructive))' }}>
            {t('common.error')}: {(error as Error).message}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-56 rounded-2xl border bg-muted/40 animate-pulse" style={{ borderColor: 'hsl(var(--border))' }} />
          ))}
        </div>
      ) : portfolios.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed p-12 text-center" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4 bg-primary/10">
            <Briefcase className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-1">{t('myPortfolios.empty.title')}</h2>
          <p className="text-sm mb-5 max-w-sm mx-auto text-muted-foreground">{t('myPortfolios.empty.description')}</p>
          {createButton}
        </div>
      ) : (
        <>
          {regular.length > 0 && renderCards(regular)}
          {experimental.length > 0 && (
            <section className={regular.length > 0 ? 'mt-10' : undefined} aria-labelledby="experimental-title">
              <div className="flex items-start gap-3 mb-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <FlaskConical className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="experimental-title" className="text-base font-semibold leading-tight">
                    {t('myPortfolios.experimental.title')}
                  </h2>
                  <p className="text-sm mt-1 text-muted-foreground">{t('myPortfolios.experimental.hint')}</p>
                </div>
              </div>
              {renderCards(experimental)}
            </section>
          )}
        </>
      )}

      {dialog?.kind === 'create' && <CreatePortfolioDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'settings' && (
        <PortfolioSettingsDialog portfolio={dialog.portfolio} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
