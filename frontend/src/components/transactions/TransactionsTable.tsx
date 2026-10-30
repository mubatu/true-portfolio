import { useTranslation } from 'react-i18next';
import { Pencil, Ticket, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HEAD_BG, HEAD_CELL_CLASS, TABLE_SCROLL_CLASS } from '@/components/analysis/tableStyles';
import { toDisplayTicker } from '@/config';
import type { Transaction } from '@/services/portfolioService';
import { useTransactionFormatters, type TransactionFormatters } from './format';

type Operation = Transaction['operation'];

const OPERATION_STYLES: Record<Operation, { backgroundColor: string; color: string }> = {
  buy: { backgroundColor: 'hsl(var(--gain) / 0.1)', color: 'hsl(var(--gain))' },
  sell: { backgroundColor: 'hsl(var(--loss) / 0.1)', color: 'hsl(var(--loss))' },
  rights_sale: { backgroundColor: 'hsl(var(--warning) / 0.12)', color: 'hsl(var(--warning))' },
};

const OPERATION_ICONS = { buy: TrendingUp, sell: TrendingDown, rights_sale: Ticket } as const;

const MUTED = 'hsl(var(--muted-foreground))';
const CELL = 'px-3 py-3 text-right tabular-nums whitespace-nowrap';

/**
 * Every trade, newest first, styled like the analysis tables. Split-adjusted
 * figures appear under the price only when a split changed them.
 */
export function TransactionsTable({
  transactions,
  market,
  isDeletePending,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  market: string;
  isDeletePending: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const { t } = useTranslation();
  const fmt = useTransactionFormatters(market);
  const head: [string, 'left' | 'right'][] = [
    [t('portfolio.transactions.date'), 'left'],
    [t('portfolio.transactions.ticker'), 'left'],
    [t('portfolio.transactions.operation'), 'left'],
    [t('portfolio.transactions.quantity'), 'right'],
    [t('portfolio.transactions.price'), 'right'],
    [t('portfolio.transactions.total'), 'right'],
  ];

  return (
    <div className={TABLE_SCROLL_CLASS}>
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr>
            {head.map(([label, align]) => (
              <th
                key={label}
                scope="col"
                className={`${HEAD_CELL_CLASS} text-${align}`}
                style={{ ...HEAD_BG, color: MUTED }}
              >
                {label}
              </th>
            ))}
            <th scope="col" className={HEAD_CELL_CLASS} style={HEAD_BG}>
              <span className="sr-only">{t('common.edit')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              market={market}
              fmt={fmt}
              isDeletePending={isDeletePending}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionRow({
  transaction,
  market,
  fmt,
  isDeletePending,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  market: string;
  fmt: TransactionFormatters;
  isDeletePending: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  const { t } = useTranslation();
  const quantity = Number(transaction.quantity);
  const adjustedQuantity = Number(transaction.adjusted_quantity ?? transaction.quantity);
  const price = Number(transaction.price);
  const adjustedPrice = Number(transaction.adjusted_price ?? transaction.price);
  const commissionRate = Number(transaction.commission_rate ?? 0);
  const adjusted = Math.abs(adjustedQuantity - quantity) > 1e-6;
  const OperationIcon = OPERATION_ICONS[transaction.operation];

  return (
    <tr className="group border-t transition-colors hover:bg-muted/40" style={{ borderColor: 'hsl(var(--border))' }}>
      <td className="px-3 py-3 text-left tabular-nums whitespace-nowrap" style={{ color: MUTED }}>
        {fmt.date(transaction.date)}
      </td>
      <th scope="row" className="px-3 py-3 text-left font-semibold whitespace-nowrap">
        {toDisplayTicker(transaction.ticker, market)}
      </th>
      <td className="px-3 py-3 text-left">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
          style={OPERATION_STYLES[transaction.operation]}
        >
          <OperationIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {t(`portfolio.transactions.${transaction.operation}`)}
        </span>
      </td>
      <td className={CELL}>{fmt.number(quantity)}</td>
      <td className={CELL}>
        <div className="flex flex-col items-end">
          <span>{fmt.money(price)}</span>
          {adjusted && (
            <span className="text-[11px]" style={{ color: MUTED }} title={t('portfolio.transactions.adjustedHint')}>
              {t('portfolio.transactions.adjustedLine', {
                quantity: fmt.number(adjustedQuantity),
                price: fmt.money(adjustedPrice),
              })}
            </span>
          )}
        </div>
      </td>
      <td className={CELL}>
        <div className="flex flex-col items-end">
          <span className="font-semibold">{fmt.money(quantity * price)}</span>
          {commissionRate > 0 && (
            <span className="text-[11px]" style={{ color: MUTED }}>
              {t('portfolio.transactions.commission', {
                amount: fmt.money(quantity * price * commissionRate),
                rate: fmt.rate(commissionRate),
              })}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            type="button"
            aria-label={t('common.edit')}
            onClick={() => onEdit(transaction)}
          >
            <Pencil className="h-4 w-4" style={{ color: MUTED }} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            type="button"
            aria-label={t('common.delete')}
            onClick={() => onDelete(transaction)}
            disabled={isDeletePending}
          >
            <Trash2 className="h-4 w-4" style={{ color: 'hsl(var(--destructive))' }} />
          </Button>
        </div>
      </td>
    </tr>
  );
}
