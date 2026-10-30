import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDateLocale, getLocale, getMarketCurrency, toDisplayTicker } from '@/config';
import { parseIsoDate } from '@/lib/dates';
import type { Transaction } from '@/services/portfolioService';

type Operation = Transaction['operation'];

interface Formatters {
  number: (value: number) => string;
  money: (value: number) => string;
  date: (isoDate: string) => string;
}

const OPERATION_STYLES: Record<Operation, { backgroundColor: string; color: string }> = {
  buy: { backgroundColor: 'hsl(142 76% 36% / 0.1)', color: 'hsl(142 76% 36%)' },
  sell: { backgroundColor: 'hsl(0 84% 60% / 0.1)', color: 'hsl(0 84% 60%)' },
};

const GROUP_START_BORDER_STYLE = { borderLeftColor: 'hsl(var(--border))' };
const GROUP_END_BORDER_STYLE = { borderRightColor: 'hsl(var(--border))' };

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
  onDelete: (transactionId: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const currency = getMarketCurrency(market);

  const fmt: Formatters = useMemo(() => {
    const numberLocale = getLocale(i18n.language);
    const number = new Intl.NumberFormat(numberLocale);
    const money = new Intl.NumberFormat(numberLocale, { style: 'currency', currency });
    const date = new Intl.DateTimeFormat(getDateLocale(i18n.language), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return {
      number: (v) => number.format(v),
      money: (v) => money.format(v),
      date: (iso) => date.format(parseIsoDate(iso)),
    };
  }, [i18n.language, currency]);

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}>
              <Th>{t('portfolio.transactions.ticker')}</Th>
              <Th>{t('portfolio.transactions.market')}</Th>
              <Th>{t('portfolio.transactions.operation')}</Th>
              <QuantityPriceHeader
                quantity={t('portfolio.transactions.quantity')}
                price={t('portfolio.transactions.price')}
              />
              <QuantityPriceHeader
                quantity={t('portfolio.transactions.adjustedQuantity')}
                price={t('portfolio.transactions.adjustedPrice')}
              />
              <Th align="right">{t('portfolio.transactions.total')}</Th>
              <Th>{t('portfolio.transactions.date')}</Th>
              <th scope="col" className="px-4 py-3 text-sm font-medium w-10"></th>
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
  fmt: Formatters;
  isDeletePending: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transactionId: number) => void;
}) {
  const { t } = useTranslation();
  const quantity = Number(transaction.quantity);
  const adjustedQuantity = Number(transaction.adjusted_quantity ?? transaction.quantity);
  const price = Number(transaction.price);
  const adjustedPrice = Number(transaction.adjusted_price ?? transaction.price);
  const OperationIcon = transaction.operation === 'buy' ? TrendingUp : TrendingDown;

  return (
    <tr className="border-t transition-colors hover:bg-muted/50" style={{ borderColor: 'hsl(var(--border))' }}>
      <td className="px-4 py-3">
        <span className="font-semibold">{toDisplayTicker(transaction.ticker, market)}</span>
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
          style={OPERATION_STYLES[transaction.operation]}
        >
          <OperationIcon className="h-4 w-4" />
          {t(`portfolio.transactions.${transaction.operation}`)}
        </span>
      </td>
      <QuantityPriceCells quantity={fmt.number(quantity)} price={fmt.money(price)} />
      <QuantityPriceCells quantity={fmt.number(adjustedQuantity)} price={fmt.money(adjustedPrice)} />
      <td className="text-right px-4 py-3 font-medium tabular-nums">
        <div className="flex flex-col items-end">
          <span>{fmt.money(quantity * price)}</span>
          <span className="text-[11px] font-normal tabular-nums" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {fmt.number(quantity)} × {fmt.money(price)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {fmt.date(transaction.date)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            type="button"
            aria-label={t('common.edit')}
            onClick={() => onEdit(transaction)}
          >
            <Pencil className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            type="button"
            aria-label={t('common.delete')}
            onClick={() => onDelete(transaction.id)}
            disabled={isDeletePending}
          >
            <Trash2 className="h-4 w-4" style={{ color: 'hsl(var(--destructive))' }} />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Building blocks ──────────────────────────────────────

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th scope="col" className={`text-${align} px-4 py-3 text-sm font-medium`}>
      {children}
    </th>
  );
}

/** "quantity × price" header group with borders on both sides. */
function QuantityPriceHeader({ quantity, price }: { quantity: string; price: string }) {
  return (
    <>
      <th scope="col" className="text-right py-3 pl-3 pr-2 text-sm font-medium border-l" style={GROUP_START_BORDER_STYLE}>
        {quantity}
      </th>
      <th scope="col" className="w-6 px-0 py-3 text-center">
        <MultiplySymbol />
      </th>
      <th scope="col" className="text-left py-3 pl-2 pr-3 text-sm font-medium border-r" style={GROUP_END_BORDER_STYLE}>
        {price}
      </th>
    </>
  );
}

function QuantityPriceCells({ quantity, price }: { quantity: string; price: string }) {
  return (
    <>
      <td className="text-right py-3 pl-3 pr-2 tabular-nums border-l" style={GROUP_START_BORDER_STYLE}>
        {quantity}
      </td>
      <td className="px-0 py-3 text-center">
        <MultiplySymbol />
      </td>
      <td
        className="text-left py-3 pl-2 pr-3 tabular-nums border-r whitespace-nowrap"
        style={GROUP_END_BORDER_STYLE}
      >
        {price}
      </td>
    </>
  );
}

function MultiplySymbol() {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold"
      style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
      aria-hidden="true"
    >
      ×
    </span>
  );
}
