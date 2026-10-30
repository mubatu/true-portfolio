import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getDateLocale, getLocale, getMarketCurrency } from '@/config';
import { parseIsoDate } from '@/lib/dates';

export interface TransactionFormatters {
  number: (value: number) => string;
  money: (value: number) => string;
  date: (isoDate: string) => string;
  /** Fraction as percent with up to 4 decimals, e.g. 0.0002 → %0,02 */
  rate: (fraction: number) => string;
}

/** Locale-aware formatters for transaction amounts in the market's currency. */
export function useTransactionFormatters(market: string): TransactionFormatters {
  const { i18n } = useTranslation();
  const currency = getMarketCurrency(market);

  return useMemo(() => {
    const numberLocale = getLocale(i18n.language);
    const number = new Intl.NumberFormat(numberLocale);
    const money = new Intl.NumberFormat(numberLocale, { style: 'currency', currency });
    const rate = new Intl.NumberFormat(numberLocale, { style: 'percent', maximumFractionDigits: 4 });
    const date = new Intl.DateTimeFormat(getDateLocale(i18n.language), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return {
      number: (v) => number.format(v),
      money: (v) => money.format(v),
      date: (iso) => date.format(parseIsoDate(iso)),
      rate: (v) => rate.format(v),
    };
  }, [i18n.language, currency]);
}
