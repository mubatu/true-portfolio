import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Briefcase, PiggyBank, Plus, TrendingUp, Wallet, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/Panel';
import { plColor, useFormatters } from '@/components/analysis/format';
import type { AnalysisResponse } from '@/components/analysis/types';
import { PortfolioCard } from '@/components/portfolio/PortfolioCard';
import {
  CreatePortfolioDialog,
  DeletePortfolioDialog,
  RenamePortfolioDialog,
} from '@/components/portfolio/PortfolioDialogs';
import { analyzePortfolio, getPortfolios, type Portfolio } from '@/services/portfolioService';

type Dialog = { kind: 'create' } | { kind: 'rename' | 'delete'; portfolio: Portfolio } | null;

/**
 * Home of a signed-in user: every portfolio at a glance, the way into its
 * analysis and transactions, and creating, renaming or deleting them.
 * Cards load their analysis into the same cache the analysis page uses,
 * so opening a portfolio from here is instant.
 */
export function MyPortfolios() {
  const { t } = useTranslation();
  const fmt = useFormatters('TRY');
  const [dialog, setDialog] = useState<Dialog>(null);

  useEffect(() => {
    document.title = `${t('myPortfolios.title')} · ${t('common.appName')}`;
  }, [t]);

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

  const loaded = analyses.map((q) => q.data).filter((d): d is AnalysisResponse => !!d);
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
  const allLoaded = withTrades.length > 0 && loaded.length === withTrades.length;
  const total = loaded.reduce(
    (acc, a) => ({
      value: acc.value + a.totals.portfolio_value + a.totals.in_the_safe,
      invested: acc.invested + a.totals.total_invested,
      pl: acc.pl + a.totals.total_pl,
    }),
    { value: 0, invested: 0, pl: 0 }
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

      {allLoaded && withTrades.length > 1 && (
        <Panel
          className="p-5 mb-6 grid gap-5 sm:grid-cols-3 sm:divide-x"
          aria-label={t('myPortfolios.totalsLabel')}
        >
          <Total icon={Wallet} label={t('myPortfolios.totalValue')} value={fmt.money(total.value)} />
          <Total icon={PiggyBank} label={t('analyze.totalInvested')} value={fmt.money(total.invested)} />
          <Total
            icon={TrendingUp}
            label={t('analyze.totalPl')}
            value={fmt.signedMoney(total.pl)}
            sub={total.invested > 0 ? fmt.pct((total.pl / total.invested) * 100) : undefined}
            tone={total.pl}
          />
        </Panel>
      )}

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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((p) => {
            const q = analysisById.get(p.id);
            return (
              <PortfolioCard
                key={p.id}
                portfolio={p}
                analysis={q?.data}
                loading={!!q?.isLoading}
                failed={!!q?.isError}
                onRetry={() => q?.refetch()}
                onRename={() => setDialog({ kind: 'rename', portfolio: p })}
                onDelete={() => setDialog({ kind: 'delete', portfolio: p })}
                fmt={fmt}
              />
            );
          })}
        </div>
      )}

      {dialog?.kind === 'create' && <CreatePortfolioDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'rename' && (
        <RenamePortfolioDialog portfolio={dialog.portfolio} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'delete' && (
        <DeletePortfolioDialog portfolio={dialog.portfolio} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function Total({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: number;
}) {
  return (
    <div className="flex items-center gap-3 sm:pl-5 first:pl-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums tracking-tight" style={{ color: tone != null ? plColor(tone) : undefined }}>
          {value}
          {sub && <span className="text-sm font-semibold ml-2">{sub}</span>}
        </p>
      </div>
    </div>
  );
}
