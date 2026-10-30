import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  TransactionFormModal,
  type TransactionFormValues,
} from '@/components/transactions/TransactionFormModal';
import { TransactionsTable } from '@/components/transactions/TransactionsTable';
import { DeleteTransactionDialog } from '@/components/transactions/DeleteTransactionDialog';
import { RightsIssuesSection } from '@/components/transactions/RightsIssuesSection';
import {
  getPortfolioBySlug,
  getTransactionsBySlug,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type Transaction,
} from '@/services/portfolioService';
import { toDisplayTicker } from '@/config';
import { PortfolioHeader } from '@/components/portfolio/PortfolioHeader';

type FormState =
  | { mode: 'add'; prefill?: Partial<TransactionFormValues> }
  | { mode: 'edit'; transaction: Transaction };

export function PortfolioDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState | null>(null);
  // Remounts the form on every opening so its fields start fresh.
  const [formKey, setFormKey] = useState(0);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  const {
    data: portfolio,
    isLoading: portfolioLoading,
    error: portfolioError,
  } = useQuery({
    queryKey: ['portfolio', slug],
    queryFn: () => getPortfolioBySlug(slug!),
    enabled: !!slug,
  });

  const {
    data: transactions = [],
    isLoading: transactionsLoading,
    error: transactionsError,
  } = useQuery({
    queryKey: ['transactions', slug],
    queryFn: () => getTransactionsBySlug(slug!),
    enabled: !!slug && !!portfolio,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions', slug] });
    queryClient.invalidateQueries({ queryKey: ['portfolios'] });
    queryClient.invalidateQueries({ queryKey: ['portfolio-analysis'] });
  };

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTransaction,
    onSuccess: () => {
      invalidate();
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      invalidate();
      setTransactionToDelete(null);
    },
  });

  const askToDelete = (transaction: Transaction) => {
    deleteMutation.reset();
    setTransactionToDelete(transaction);
  };

  const openForm = (state: FormState) => {
    createMutation.reset();
    updateMutation.reset();
    setFormKey((k) => k + 1);
    setForm(state);
  };

  const closeForm = () => setForm(null);

  const handleSubmit = (values: TransactionFormValues) => {
    if (form?.mode === 'edit') {
      updateMutation.mutate({ id: form.transaction.id, ...values });
    } else if (portfolio) {
      createMutation.mutate({ portfolio_id: portfolio.id, ...values });
    }
  };

  const activeMutation = form?.mode === 'edit' ? updateMutation : createMutation;
  const market = portfolio?.market ?? 'BIST';

  const isLoading = portfolioLoading || transactionsLoading;
  const error = portfolioError || transactionsError;

  useEffect(() => {
    if (portfolio?.name) document.title = `${portfolio.name} · ${t('portfolio.tabs.transactions')} · ${t('common.appName')}`;
  }, [portfolio?.name, t]);

  if (!isLoading && !portfolio && !error) {
    return (
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
        <PortfolioHeader portfolio={null} />
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: 'hsl(var(--border))' }}>
          <p style={{ color: 'hsl(var(--muted-foreground))' }}>{t('portfolio.notFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      <PortfolioHeader
        portfolio={portfolio}
        actions={
          portfolio && (
            <Button onClick={() => openForm({ mode: 'add' })} className="gap-2">
              <Plus className="h-4 w-4" />
              {t('portfolio.addTransaction')}
            </Button>
          )
        }
      />

      {isLoading && (
        <div className="flex items-center justify-center py-12" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border p-4 text-center"
          style={{
            borderColor: 'hsl(var(--destructive))',
            backgroundColor: 'hsl(var(--destructive) / 0.1)',
          }}
          role="alert"
        >
          <p style={{ color: 'hsl(var(--destructive))' }}>
            {t('common.error')}: {(error as Error).message}
          </p>
        </div>
      )}

      {!isLoading && portfolio && (
        <>
          <div>
            <h2 className="text-lg font-semibold mb-4">{t('portfolio.transactions.title')}</h2>

            {transactions.length === 0 ? (
              <div
                className="rounded-lg border-2 border-dashed p-8 text-center"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <div
                  className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3"
                  style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
                >
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{t('portfolio.transactions.empty.title')}</h3>
                <p
                  className="text-sm mb-4 max-w-sm mx-auto"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  {t('portfolio.transactions.empty.description')}
                </p>
                <Button onClick={() => openForm({ mode: 'add' })} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t('portfolio.addTransaction')}
                </Button>
              </div>
            ) : (
              <TransactionsTable
                transactions={transactions}
                market={portfolio.market}
                isDeletePending={deleteMutation.isPending}
                onEdit={(transaction) => openForm({ mode: 'edit', transaction })}
                onDelete={askToDelete}
              />
            )}
          </div>

          {transactions.length > 0 && (
            <RightsIssuesSection
              portfolioId={portfolio.id}
              market={portfolio.market}
              tickers={[...new Set(transactions.map((txn) => txn.ticker))].sort()}
              onRecordTransaction={(prefill) => openForm({ mode: 'add', prefill })}
            />
          )}
        </>
      )}

      {transactionToDelete && (
        <DeleteTransactionDialog
          transaction={transactionToDelete}
          market={market}
          isPending={deleteMutation.isPending}
          error={deleteMutation.error?.message}
          onCancel={() => setTransactionToDelete(null)}
          onConfirm={() => deleteMutation.mutate(transactionToDelete.id)}
        />
      )}

      {form && (
        <TransactionFormModal
          key={formKey}
          title={t(
            form.mode === 'edit'
              ? 'portfolio.editTransactionModal.title'
              : 'portfolio.addTransactionModal.title'
          )}
          initial={
            form.mode === 'edit'
              ? {
                  ticker: toDisplayTicker(form.transaction.ticker, market),
                  operation: form.transaction.operation,
                  quantity: form.transaction.quantity,
                  price: form.transaction.price,
                  commission_rate: form.transaction.commission_rate,
                  date: form.transaction.date,
                }
              : form.prefill
          }
          isPending={activeMutation.isPending}
          error={activeMutation.error?.message}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
