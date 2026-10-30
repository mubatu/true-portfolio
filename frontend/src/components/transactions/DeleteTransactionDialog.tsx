import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { toDisplayTicker } from '@/config';
import type { Transaction } from '@/services/portfolioService';
import { useTransactionFormatters } from './format';

/** Asks before deleting a transaction and shows which one it is. */
export function DeleteTransactionDialog({
  transaction,
  market,
  isPending,
  error,
  onCancel,
  onConfirm,
}: {
  transaction: Transaction;
  market: string;
  isPending: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const fmt = useTransactionFormatters(market);
  const quantity = Number(transaction.quantity);
  const price = Number(transaction.price);

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={t('portfolio.deleteTransactionConfirm.title')}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t('portfolio.deleteTransactionConfirm.confirm')
            )}
          </Button>
        </>
      }
    >
      <div
        className="rounded-lg border px-4 py-3 mb-4 text-sm"
        style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted) / 0.4)' }}
      >
        <p className="font-semibold">
          {toDisplayTicker(transaction.ticker, market)} ·{' '}
          {t(`portfolio.transactions.${transaction.operation}`)}
        </p>
        <p style={{ color: 'hsl(var(--muted-foreground))' }}>
          {fmt.number(quantity)} × {fmt.money(price)} = {fmt.money(quantity * price)} ·{' '}
          {fmt.date(transaction.date)}
        </p>
      </div>

      <p style={{ color: 'hsl(var(--muted-foreground))' }}>
        {t('portfolio.deleteTransactionConfirm.message')}
      </p>

      {error && (
        <p className="text-sm mt-3" style={{ color: 'hsl(var(--destructive))' }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
