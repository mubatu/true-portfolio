import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  TrendingUp,
  TrendingDown,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import {
  getPortfolioBySlug,
  getTransactionsBySlug,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type Transaction,
} from '@/services/portfolioService';
import {
  getMarketCurrency,
  getDateLocale,
  getLocale,
  toDisplayTicker,
} from '@/config';

type TransactionOperation = Transaction['operation'];

interface TransactionsTableProps {
  transactions: Transaction[];
  market: string;
  isDeletePending: boolean;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (transactionId: number) => void;
  formatNumber: (value: number) => string;
  formatCurrency: (value: number, currency?: string) => string;
  formatDate: (dateString: string) => string;
}

interface TransactionRowProps {
  transaction: Transaction;
  market: string;
  marketCurrency: string;
  operationLabels: Record<TransactionOperation, string>;
  actionLabels: {
    edit: string;
    delete: string;
  };
  isDeletePending: boolean;
  onEditTransaction: (transaction: Transaction) => void;
  onDeleteTransaction: (transactionId: number) => void;
  formatNumber: (value: number) => string;
  formatCurrency: (value: number, currency?: string) => string;
  formatDate: (dateString: string) => string;
}

const TRANSACTION_OPERATION_STYLES: Record<
  TransactionOperation,
  { backgroundColor: string; color: string }
> = {
  buy: {
    backgroundColor: 'hsl(142 76% 36% / 0.1)',
    color: 'hsl(142 76% 36%)',
  },
  sell: {
    backgroundColor: 'hsl(0 84% 60% / 0.1)',
    color: 'hsl(0 84% 60%)',
  },
};

const GROUP_START_BORDER_STYLE = {
  borderLeftColor: 'hsl(var(--border))',
};

const GROUP_END_BORDER_STYLE = {
  borderRightColor: 'hsl(var(--border))',
};

export function PortfolioDetail() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [addError, setAddError] = useState('');
  const [editError, setEditError] = useState('');

  // Form state for new transaction
  const [ticker, setTicker] = useState('');
  const [operation, setOperation] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Fetch portfolio details
  const {
    data: portfolio,
    isLoading: portfolioLoading,
    error: portfolioError,
  } = useQuery({
    queryKey: ['portfolio', slug],
    queryFn: () => getPortfolioBySlug(slug!),
    enabled: !!slug,
  });

  // Fetch transactions
  const {
    data: transactions = [],
    isLoading: transactionsLoading,
    error: transactionsError,
  } = useQuery({
    queryKey: ['transactions', slug],
    queryFn: () => getTransactionsBySlug(slug!),
    enabled: !!slug && !!portfolio,
  });

  // Create transaction mutation
  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', slug] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-analysis'] });
      closeAddModal();
    },
    onError: (error: Error) => {
      setAddError(error.message);
    },
  });

  // Delete transaction mutation
  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', slug] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-analysis'] });
    },
  });

  // Update transaction mutation
  const updateMutation = useMutation({
    mutationFn: updateTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', slug] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-analysis'] });
      closeEditModal();
    },
    onError: (error: Error) => {
      setEditError(error.message);
    },
  });

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setTicker('');
    setOperation('buy');
    setQuantity('');
    setPrice('');
    setDate(new Date().toISOString().split('T')[0]);
    setAddError('');
  };

  const openEditModal = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setTicker(toDisplayTicker(transaction.ticker, portfolio?.market ?? 'BIST'));
    setOperation(transaction.operation);
    setQuantity(String(transaction.quantity));
    setPrice(String(transaction.price));
    setDate(transaction.date);
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingTransaction(null);
    setTicker('');
    setOperation('buy');
    setQuantity('');
    setPrice('');
    setDate(new Date().toISOString().split('T')[0]);
    setEditError('');
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticker && quantity && price && date && portfolio) {
      createMutation.mutate({
        portfolio_id: portfolio.id,
        ticker: ticker.toUpperCase(),
        operation,
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        date,
      });
    }
  };

  const handleDeleteTransaction = (transactionId: number) => {
    deleteMutation.mutate(transactionId);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTransaction && ticker && quantity && price && date) {
      updateMutation.mutate({
        id: editingTransaction.id,
        ticker: ticker.toUpperCase(),
        operation,
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        date,
      });
    }
  };

  const numberLocale = getLocale(i18n.language);
  const dateLocale = getDateLocale(i18n.language);

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat(numberLocale).format(value);
  };

  const formatCurrency = (value: number, currency: string = 'TRY') => {
    return new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency,
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(dateLocale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isLoading = portfolioLoading || transactionsLoading;
  const error = portfolioError || transactionsError;

  // Not found state
  if (!isLoading && !portfolio) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/my-portfolios')}
          className="gap-2 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('portfolio.back')}
        </Button>
        <div
          className="rounded-lg border p-8 text-center"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <p style={{ color: 'hsl(var(--muted-foreground))' }}>
            Portfolio not found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate('/my-portfolios')}
        className="gap-2 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('portfolio.back')}
      </Button>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          className="rounded-lg border p-4 text-center"
          style={{
            borderColor: 'hsl(var(--destructive))',
            backgroundColor: 'hsl(var(--destructive) / 0.1)',
          }}
        >
          <p style={{ color: 'hsl(var(--destructive))' }}>
            {t('common.error')}: {(error as Error).message}
          </p>
        </div>
      )}

      {/* Portfolio Content */}
      {!isLoading && portfolio && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold">{portfolio.name}</h1>
              <div className="mt-2">
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded text-sm font-medium"
                  style={{
                    backgroundColor: 'hsl(var(--muted))',
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  {t('portfolio.marketTag', { market: portfolio.market })}
                </span>
              </div>
              <p
                className="text-sm mt-1 flex items-center gap-2"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                <Calendar className="h-4 w-4" />
                Created {formatDate(portfolio.created_at)}
              </p>
            </div>
            <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {t('portfolio.addTransaction')}
            </Button>
          </div>

          {/* Transactions Section */}
          <div>
            <h2 className="text-xl font-semibold mb-4">
              {t('portfolio.transactions.title')}
            </h2>

            {/* Empty State */}
            {transactions.length === 0 && (
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
                <h3 className="font-semibold mb-1">
                  {t('portfolio.transactions.empty.title')}
                </h3>
                <p
                  className="text-sm mb-4 max-w-sm mx-auto"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  {t('portfolio.transactions.empty.description')}
                </p>
                <Button
                  onClick={() => setIsAddModalOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {t('portfolio.addTransaction')}
                </Button>
              </div>
            )}

            {/* Transactions Table */}
            {transactions.length > 0 && (
              <TransactionsTable
                transactions={transactions}
                market={portfolio.market}
                isDeletePending={deleteMutation.isPending}
                onEditTransaction={openEditModal}
                onDeleteTransaction={handleDeleteTransaction}
                formatNumber={formatNumber}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            )}
          </div>
        </>
      )}

      {/* Add Transaction Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={closeAddModal}
        title={t('portfolio.addTransactionModal.title')}
        footer={
          <>
            <Button variant="outline" onClick={closeAddModal}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleAddSubmit}
              disabled={
                !ticker ||
                !quantity ||
                !price ||
                !date ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('common.save')
              )}
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {/* Ticker */}
          <div>
            <label htmlFor="ticker" className="block text-sm font-medium mb-2">
              {t('portfolio.addTransactionModal.tickerLabel')}
            </label>
            <input
              id="ticker"
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder={t('portfolio.addTransactionModal.tickerPlaceholder')}
              autoFocus
              className="w-full px-3 py-2 rounded-md border bg-transparent uppercase"
              style={{ borderColor: 'hsl(var(--input))' }}
            />
          </div>

          {/* Operation */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('portfolio.addTransactionModal.operationLabel')}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOperation('buy')}
                className="flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors"
                style={{
                  borderColor:
                    operation === 'buy'
                      ? 'hsl(142 76% 36%)'
                      : 'hsl(var(--input))',
                  backgroundColor:
                    operation === 'buy'
                      ? 'hsl(142 76% 36% / 0.1)'
                      : 'transparent',
                  color:
                    operation === 'buy'
                      ? 'hsl(142 76% 36%)'
                      : 'hsl(var(--foreground))',
                }}
              >
                {t('portfolio.transactions.buy')}
              </button>
              <button
                type="button"
                onClick={() => setOperation('sell')}
                className="flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors"
                style={{
                  borderColor:
                    operation === 'sell'
                      ? 'hsl(0 84% 60%)'
                      : 'hsl(var(--input))',
                  backgroundColor:
                    operation === 'sell'
                      ? 'hsl(0 84% 60% / 0.1)'
                      : 'transparent',
                  color:
                    operation === 'sell'
                      ? 'hsl(0 84% 60%)'
                      : 'hsl(var(--foreground))',
                }}
              >
                {t('portfolio.transactions.sell')}
              </button>
            </div>
          </div>

          {/* Quantity & Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="quantity"
                className="block text-sm font-medium mb-2"
              >
                {t('portfolio.addTransactionModal.quantityLabel')}
              </label>
              <input
                id="quantity"
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={t(
                  'portfolio.addTransactionModal.quantityPlaceholder'
                )}
                className="w-full px-3 py-2 rounded-md border bg-transparent"
                style={{ borderColor: 'hsl(var(--input))' }}
              />
            </div>
            <div>
              <label htmlFor="price" className="block text-sm font-medium mb-2">
                {t('portfolio.addTransactionModal.priceLabel')}
              </label>
              <input
                id="price"
                type="number"
                step="any"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={t('portfolio.addTransactionModal.pricePlaceholder')}
                className="w-full px-3 py-2 rounded-md border bg-transparent"
                style={{ borderColor: 'hsl(var(--input))' }}
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label htmlFor="date" className="block text-sm font-medium mb-2">
              {t('portfolio.addTransactionModal.dateLabel')}
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'hsl(var(--input))' }}
            />
          </div>

          {addError && (
            <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
              {addError}
            </p>
          )}
        </form>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        title={t('portfolio.editTransactionModal.title')}
        footer={
          <>
            <Button variant="outline" onClick={closeEditModal}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={
                !ticker ||
                !quantity ||
                !price ||
                !date ||
                updateMutation.isPending
              }
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('common.save')
              )}
            </Button>
          </>
        }
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {/* Ticker */}
          <div>
            <label htmlFor="edit-ticker" className="block text-sm font-medium mb-2">
              {t('portfolio.addTransactionModal.tickerLabel')}
            </label>
            <input
              id="edit-ticker"
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder={t('portfolio.addTransactionModal.tickerPlaceholder')}
              className="w-full px-3 py-2 rounded-md border bg-transparent uppercase"
              style={{ borderColor: 'hsl(var(--input))' }}
            />
          </div>

          {/* Operation */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('portfolio.addTransactionModal.operationLabel')}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOperation('buy')}
                className="flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors"
                style={{
                  borderColor:
                    operation === 'buy'
                      ? 'hsl(142 76% 36%)'
                      : 'hsl(var(--input))',
                  backgroundColor:
                    operation === 'buy'
                      ? 'hsl(142 76% 36% / 0.1)'
                      : 'transparent',
                  color:
                    operation === 'buy'
                      ? 'hsl(142 76% 36%)'
                      : 'hsl(var(--foreground))',
                }}
              >
                {t('portfolio.transactions.buy')}
              </button>
              <button
                type="button"
                onClick={() => setOperation('sell')}
                className="flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors"
                style={{
                  borderColor:
                    operation === 'sell'
                      ? 'hsl(0 84% 60%)'
                      : 'hsl(var(--input))',
                  backgroundColor:
                    operation === 'sell'
                      ? 'hsl(0 84% 60% / 0.1)'
                      : 'transparent',
                  color:
                    operation === 'sell'
                      ? 'hsl(0 84% 60%)'
                      : 'hsl(var(--foreground))',
                }}
              >
                {t('portfolio.transactions.sell')}
              </button>
            </div>
          </div>

          {/* Quantity & Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="edit-quantity"
                className="block text-sm font-medium mb-2"
              >
                {t('portfolio.addTransactionModal.quantityLabel')}
              </label>
              <input
                id="edit-quantity"
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={t(
                  'portfolio.addTransactionModal.quantityPlaceholder'
                )}
                className="w-full px-3 py-2 rounded-md border bg-transparent"
                style={{ borderColor: 'hsl(var(--input))' }}
              />
            </div>
            <div>
              <label htmlFor="edit-price" className="block text-sm font-medium mb-2">
                {t('portfolio.addTransactionModal.priceLabel')}
              </label>
              <input
                id="edit-price"
                type="number"
                step="any"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={t('portfolio.addTransactionModal.pricePlaceholder')}
                className="w-full px-3 py-2 rounded-md border bg-transparent"
                style={{ borderColor: 'hsl(var(--input))' }}
              />
            </div>
          </div>

          {/* Date */}
          <div>
            <label htmlFor="edit-date" className="block text-sm font-medium mb-2">
              {t('portfolio.addTransactionModal.dateLabel')}
            </label>
            <input
              id="edit-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-md border bg-transparent"
              style={{ borderColor: 'hsl(var(--input))' }}
            />
          </div>

          {editError && (
            <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
              {editError}
            </p>
          )}
        </form>
      </Modal>
    </div>
  );
}

function TransactionsTable({
  transactions,
  market,
  isDeletePending,
  onEditTransaction,
  onDeleteTransaction,
  formatNumber,
  formatCurrency,
  formatDate,
}: TransactionsTableProps) {
  const { t } = useTranslation();
  const marketCurrency = getMarketCurrency(market);
  const operationLabels = {
    buy: t('portfolio.transactions.buy'),
    sell: t('portfolio.transactions.sell'),
  } satisfies Record<TransactionOperation, string>;
  const actionLabels = {
    edit: t('common.edit'),
    delete: t('common.delete'),
  };

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}>
              <th scope="col" className="text-left px-4 py-3 text-sm font-medium">
                {t('portfolio.transactions.ticker')}
              </th>
              <th scope="col" className="text-left px-4 py-3 text-sm font-medium">
                {t('portfolio.transactions.market')}
              </th>
              <th scope="col" className="text-left px-4 py-3 text-sm font-medium">
                {t('portfolio.transactions.operation')}
              </th>
              <th
                scope="col"
                className="text-right py-3 pl-3 pr-2 text-sm font-medium border-l"
                style={GROUP_START_BORDER_STYLE}
              >
                {t('portfolio.transactions.quantity')}
              </th>
              <th scope="col" className="w-6 px-0 py-3 text-center">
                <MultiplySymbol />
              </th>
              <th
                scope="col"
                className="text-left py-3 pl-2 pr-3 text-sm font-medium border-r"
                style={GROUP_END_BORDER_STYLE}
              >
                {t('portfolio.transactions.price')}
              </th>
              <th
                scope="col"
                className="text-right py-3 pl-3 pr-2 text-sm font-medium border-l"
                style={GROUP_START_BORDER_STYLE}
              >
                {t('portfolio.transactions.adjustedQuantity')}
              </th>
              <th scope="col" className="w-6 px-0 py-3 text-center">
                <MultiplySymbol />
              </th>
              <th
                scope="col"
                className="text-left py-3 pl-2 pr-3 text-sm font-medium border-r"
                style={GROUP_END_BORDER_STYLE}
              >
                {t('portfolio.transactions.adjustedPrice')}
              </th>
              <th scope="col" className="text-right px-4 py-3 text-sm font-medium">
                {t('portfolio.transactions.total')}
              </th>
              <th scope="col" className="text-left px-4 py-3 text-sm font-medium">
                {t('portfolio.transactions.date')}
              </th>
              <th scope="col" className="px-4 py-3 text-sm font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                market={market}
                marketCurrency={marketCurrency}
                operationLabels={operationLabels}
                actionLabels={actionLabels}
                isDeletePending={isDeletePending}
                onEditTransaction={onEditTransaction}
                onDeleteTransaction={onDeleteTransaction}
                formatNumber={formatNumber}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionRow({
  transaction,
  market,
  marketCurrency,
  operationLabels,
  actionLabels,
  isDeletePending,
  onEditTransaction,
  onDeleteTransaction,
  formatNumber,
  formatCurrency,
  formatDate,
}: TransactionRowProps) {
  const quantity = Number(transaction.quantity);
  const adjustedQuantity = Number(
    transaction.adjusted_quantity ?? transaction.quantity
  );
  const price = Number(transaction.price);
  const adjustedPrice = Number(transaction.adjusted_price ?? transaction.price);
  const total = quantity * price;
  const operationStyle = TRANSACTION_OPERATION_STYLES[transaction.operation];
  const OperationIcon = transaction.operation === 'buy' ? TrendingUp : TrendingDown;

  return (
    <tr
      className="border-t transition-colors hover:bg-muted/50"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      <td className="px-4 py-3">
        <span className="font-semibold">
          {toDisplayTicker(transaction.ticker, market)}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded text-sm font-medium"
          style={{ backgroundColor: 'hsl(var(--muted))' }}
        >
          {market}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
          style={operationStyle}
        >
          <OperationIcon className="h-4 w-4" />
          {operationLabels[transaction.operation]}
        </span>
      </td>
      <td
        className="text-right py-3 pl-3 pr-2 tabular-nums border-l"
        style={GROUP_START_BORDER_STYLE}
      >
        {formatNumber(quantity)}
      </td>
      <td className="px-0 py-3 text-center">
        <MultiplySymbol />
      </td>
      <td
        className="text-left py-3 pl-2 pr-3 tabular-nums border-r whitespace-nowrap"
        style={GROUP_END_BORDER_STYLE}
      >
        {formatCurrency(price, marketCurrency)}
      </td>
      <td
        className="text-right py-3 pl-3 pr-2 tabular-nums border-l"
        style={GROUP_START_BORDER_STYLE}
      >
        {formatNumber(adjustedQuantity)}
      </td>
      <td className="px-0 py-3 text-center">
        <MultiplySymbol />
      </td>
      <td
        className="text-left py-3 pl-2 pr-3 tabular-nums border-r whitespace-nowrap"
        style={GROUP_END_BORDER_STYLE}
      >
        {formatCurrency(adjustedPrice, marketCurrency)}
      </td>
      <td className="text-right px-4 py-3 font-medium tabular-nums">
        <div className="flex flex-col items-end">
          <span>{formatCurrency(total, marketCurrency)}</span>
          <span
            className="text-[11px] font-normal tabular-nums"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            {formatNumber(quantity)} × {formatCurrency(price, marketCurrency)}
          </span>
        </div>
      </td>
      <td
        className="px-4 py-3 text-sm"
        style={{ color: 'hsl(var(--muted-foreground))' }}
      >
        {formatDate(transaction.date)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            type="button"
            aria-label={actionLabels.edit}
            onClick={() => onEditTransaction(transaction)}
          >
            <Pencil
              className="h-4 w-4"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            type="button"
            aria-label={actionLabels.delete}
            onClick={() => onDeleteTransaction(transaction.id)}
            disabled={isDeletePending}
          >
            <Trash2
              className="h-4 w-4"
              style={{ color: 'hsl(var(--destructive))' }}
            />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function MultiplySymbol() {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold"
      style={{
        backgroundColor: 'hsl(var(--muted))',
        color: 'hsl(var(--muted-foreground))',
      }}
      aria-hidden="true"
    >
      ×
    </span>
  );
}
