import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getDateLocale, getLocale } from '@/config';
import { parseIsoDate } from '@/lib/dates';

export const plColor = (value: number) =>
  value >= 0 ? 'hsl(var(--gain))' : 'hsl(var(--loss))';

export const plBg = (value: number) =>
  value >= 0 ? 'hsl(var(--gain) / 0.1)' : 'hsl(var(--loss) / 0.1)';

export type Formatters = ReturnType<typeof useFormatters>;

/** Locale-aware formatters shared by the analysis components. */
export function useFormatters(currencyCode: string) {
  const { i18n } = useTranslation();
  const numberLocale = getLocale(i18n.language);
  const dateLocale = getDateLocale(i18n.language);

  return useMemo(() => {
    const currency = new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: currencyCode,
    });
    const compactCurrency = new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: currencyCode,
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    const number = new Intl.NumberFormat(numberLocale);
    const unit = new Intl.NumberFormat(numberLocale, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
    const signedMoney = new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: currencyCode,
      signDisplay: 'exceptZero',
    });
    const rate = new Intl.NumberFormat(numberLocale, {
      style: 'percent',
      maximumFractionDigits: 2,
    });
    const signedPct = new Intl.NumberFormat(numberLocale, {
      style: 'percent',
      signDisplay: 'exceptZero',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const signedPoints = new Intl.NumberFormat(numberLocale, {
      signDisplay: 'exceptZero',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const share = new Intl.NumberFormat(numberLocale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    const axisPct = new Intl.NumberFormat(numberLocale, {
      style: 'percent',
      maximumFractionDigits: 0,
    });
    const fullDate = new Intl.DateTimeFormat(dateLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const shortDate = new Intl.DateTimeFormat(dateLocale, {
      day: 'numeric',
      month: 'short',
    });
    const monthYear = new Intl.DateTimeFormat(dateLocale, {
      month: 'long',
      year: 'numeric',
    });

    return {
      money: (v: number) => currency.format(v),
      compactMoney: (v: number) => compactCurrency.format(v),
      number: (v: number) => number.format(v),
      /** Fund unit price, 4 decimals, e.g. 1,6063 */
      unit: (v: number) => unit.format(v),
      /** Money with an explicit sign, e.g. +₺1.234,00 */
      signedMoney: (v: number) => signedMoney.format(v),
      /** Signed percent from a percent number, e.g. 12.34 → +12.34% / +%12,34 */
      pct: (v: number) => signedPct.format(v / 100),
      /** Unsigned share of a whole, e.g. 23.45 → %23,5 */
      share: (v: number) => share.format(v / 100),
      /** Difference of two percentages, in points, e.g. 48.54 → +48.54 */
      points: (v: number) => signedPoints.format(v),
      /** Whole percent for chart axes, e.g. 30 → 30% / %30 */
      axisPct: (v: number) => axisPct.format(v / 100),
      /** Fraction as percent, e.g. 0.15 → 15% */
      rate: (v: number) => rate.format(v),
      date: (iso: string) => fullDate.format(parseIsoDate(iso)),
      shortDate: (iso: string) => shortDate.format(parseIsoDate(iso)),
      month: (yyyyMm: string) => monthYear.format(parseIsoDate(`${yyyyMm}-01`)),
    };
  }, [currencyCode, numberLocale, dateLocale]);
}
