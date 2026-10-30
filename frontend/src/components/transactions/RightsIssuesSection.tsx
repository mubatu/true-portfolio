import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { toDisplayTicker } from '@/config';
import {
  deleteRightsIssue,
  getRightsIssues,
  saveRightsIssue,
  type RightsIssue,
  type RightsIssueInput,
} from '@/lib/api';
import { useTransactionFormatters } from './format';
import { RightsIssueFormModal } from './RightsIssueFormModal';
import type { TransactionFormValues } from './TransactionFormModal';

type Prefill = Partial<TransactionFormValues>;

/**
 * Rights issues (bedelli) of the portfolio's tickers: lists what the
 * portfolio was entitled to, lets the user enter terms from KAP, and turns
 * "I exercised / I sold my rights" into prefilled transactions.
 */
export function RightsIssuesSection({
  portfolioId,
  market,
  tickers,
  onRecordTransaction,
}: {
  portfolioId: number;
  market: string;
  tickers: string[];
  onRecordTransaction: (prefill: Prefill) => void;
}) {
  const { t } = useTranslation();
  const fmt = useTransactionFormatters(market);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RightsIssue | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<RightsIssue | null>(null);

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ['rights-issues', portfolioId],
    queryFn: () => getRightsIssues(portfolioId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['rights-issues', portfolioId] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-analysis'] });
  };

  const saveMutation = useMutation({
    mutationFn: (input: RightsIssueInput) => saveRightsIssue(portfolioId, input),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (issue: RightsIssue) => deleteRightsIssue(portfolioId, issue.ticker, issue.ex_date),
    onSuccess: () => {
      invalidate();
      setToDelete(null);
    },
  });

  const errorText = (error: unknown) => {
    if (!error) return undefined;
    const code = isAxiosError(error) ? error.response?.data?.detail : undefined;
    return typeof code === 'string'
      ? t(`rightsIssues.errors.${code}`, { defaultValue: t('common.error') })
      : t('common.error');
  };

  const open = (target: RightsIssue | 'new') => {
    saveMutation.reset();
    setEditing(target);
  };

  return (
    <section className="mt-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
        <h2 className="text-xl font-semibold">{t('rightsIssues.title')}</h2>
        <Button variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => open('new')}>
          <Plus className="h-4 w-4" />
          {t('rightsIssues.add')}
        </Button>
      </div>
      <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {t('rightsIssues.hint')}
      </p>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : issues.length === 0 ? (
        <div
          className="rounded-lg border-2 border-dashed p-6 text-center text-sm"
          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
        >
          {t('rightsIssues.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => (
            <div
              key={`${issue.ticker}-${issue.ex_date}`}
              className="rounded-lg border p-4 flex flex-col lg:flex-row lg:items-center gap-3"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{toDisplayTicker(issue.ticker, market)}</span>
                  <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {fmt.date(issue.ex_date)}
                  </span>
                  {issue.source === 'detected' && <Badge tone="info">{t('rightsIssues.detected')}</Badge>}
                  {issue.needs_review && <Badge tone="warning">{t('rightsIssues.needsReview')}</Badge>}
                </div>
                <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {issue.ratio != null && issue.subscription_price != null
                    ? t('rightsIssues.terms', {
                        ratio: fmt.number(issue.ratio * 100),
                        price: fmt.money(issue.subscription_price),
                      })
                    : t('rightsIssues.missingTerms')}
                  {' · '}
                  {t('rightsIssues.entitled', { shares: fmt.number(issue.entitled_shares) })}
                  {issue.rights != null && (
                    <>
                      {' · '}
                      <span className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
                        {t('rightsIssues.rights', { count: issue.rights, rights: fmt.number(issue.rights) })}
                      </span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={issue.rights == null}
                  onClick={() =>
                    onRecordTransaction({
                      ticker: toDisplayTicker(issue.ticker, market),
                      operation: 'buy',
                      quantity: issue.rights ?? undefined,
                      price: issue.subscription_price ?? undefined,
                      date: issue.ex_date,
                    })
                  }
                >
                  {t('rightsIssues.exercised')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={issue.rights == null}
                  onClick={() =>
                    onRecordTransaction({
                      ticker: toDisplayTicker(issue.ticker, market),
                      operation: 'rights_sale',
                      quantity: issue.rights ?? undefined,
                      date: issue.ex_date,
                    })
                  }
                >
                  {t('rightsIssues.sold')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t('common.edit')}
                  onClick={() => open(issue)}
                >
                  <Pencil className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={t('common.delete')}
                  onClick={() => {
                    deleteMutation.reset();
                    setToDelete(issue);
                  }}
                >
                  <Trash2 className="h-4 w-4" style={{ color: 'hsl(var(--destructive))' }} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <RightsIssueFormModal
          key={editing === 'new' ? 'new' : `${editing.ticker}-${editing.ex_date}`}
          tickers={tickers}
          market={market}
          initial={editing === 'new' ? undefined : editing}
          isPending={saveMutation.isPending}
          error={errorText(saveMutation.error)}
          onClose={() => setEditing(null)}
          onSubmit={(input) => saveMutation.mutate(input)}
        />
      )}

      {toDelete && (
        <Modal
          isOpen
          onClose={() => setToDelete(null)}
          title={t('rightsIssues.deleteConfirm.title')}
          footer={
            <>
              <Button variant="outline" onClick={() => setToDelete(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(toDelete)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.delete')}
              </Button>
            </>
          }
        >
          <p style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('rightsIssues.deleteConfirm.message', {
              ticker: toDisplayTicker(toDelete.ticker, market),
              date: fmt.date(toDelete.ex_date),
            })}
          </p>
          {deleteMutation.error && (
            <p className="text-sm mt-3" style={{ color: 'hsl(var(--destructive))' }}>
              {errorText(deleteMutation.error)}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}

function Badge({ tone, children }: { tone: 'info' | 'warning'; children: React.ReactNode }) {
  const colors =
    tone === 'warning'
      ? { backgroundColor: 'hsl(38 92% 50% / 0.15)', color: 'hsl(38 92% 35%)' }
      : { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={colors}>
      {children}
    </span>
  );
}
