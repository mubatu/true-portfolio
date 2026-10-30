import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { todayIso } from '@/lib/dates';
import type { Transaction } from '@/services/portfolioService';

type Operation = Transaction['operation'];

export interface TransactionFormValues {
  ticker: string;
  operation: Operation;
  quantity: number;
  price: number;
  date: string;
}

const OPERATION_COLORS: Record<Operation, { color: string; background: string }> = {
  buy: { color: 'hsl(142 76% 36%)', background: 'hsl(142 76% 36% / 0.1)' },
  sell: { color: 'hsl(0 84% 60%)', background: 'hsl(0 84% 60% / 0.1)' },
};

const INPUT_CLASS = 'w-full px-3 py-2 rounded-md border bg-transparent';
const INPUT_STYLE = { borderColor: 'hsl(var(--input))' };

/**
 * Add / edit transaction dialog. Owns its field state; the parent remounts
 * it (via ``key``) for each opening so fields always start fresh.
 */
export function TransactionFormModal({
  title,
  initial,
  isPending,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  /** Ticker in display form (without the market suffix). */
  initial?: { ticker: string; operation: Operation; quantity: number; price: number; date: string };
  isPending: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: TransactionFormValues) => void;
}) {
  const { t } = useTranslation();
  const [ticker, setTicker] = useState(initial?.ticker ?? '');
  const [operation, setOperation] = useState<Operation>(initial?.operation ?? 'buy');
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [date, setDate] = useState(initial?.date ?? todayIso());

  const isComplete = Boolean(ticker && quantity && price && date);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!isComplete || isPending) return;
    onSubmit({
      ticker: ticker.toUpperCase(),
      operation,
      quantity: parseFloat(quantity),
      price: parseFloat(price),
      date,
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => handleSubmit()} disabled={!isComplete || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field id="txn-ticker" label={t('portfolio.addTransactionModal.tickerLabel')}>
          <input
            id="txn-ticker"
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder={t('portfolio.addTransactionModal.tickerPlaceholder')}
            autoFocus={!initial}
            className={`${INPUT_CLASS} uppercase`}
            style={INPUT_STYLE}
          />
        </Field>

        <Field label={t('portfolio.addTransactionModal.operationLabel')}>
          <div className="flex gap-2">
            {(['buy', 'sell'] as const).map((op) => {
              const selected = operation === op;
              const { color, background } = OPERATION_COLORS[op];
              return (
                <button
                  key={op}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setOperation(op)}
                  className="flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors"
                  style={{
                    borderColor: selected ? color : 'hsl(var(--input))',
                    backgroundColor: selected ? background : 'transparent',
                    color: selected ? color : 'hsl(var(--foreground))',
                  }}
                >
                  {t(`portfolio.transactions.${op}`)}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field id="txn-quantity" label={t('portfolio.addTransactionModal.quantityLabel')}>
            <input
              id="txn-quantity"
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={t('portfolio.addTransactionModal.quantityPlaceholder')}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field id="txn-price" label={t('portfolio.addTransactionModal.priceLabel')}>
            <input
              id="txn-price"
              type="number"
              step="any"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={t('portfolio.addTransactionModal.pricePlaceholder')}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
        </div>

        <Field id="txn-date" label={t('portfolio.addTransactionModal.dateLabel')}>
          <input
            id="txn-date"
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </Field>

        {error && (
          <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
            {error}
          </p>
        )}

        {/* Lets Enter submit the form; the visible button lives in the footer. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function Field({ id, label, children }: { id?: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}
