import { useTranslation } from 'react-i18next';
import type { Formatters } from '@/components/analysis/format';
import { elapsed } from './publicData';

/** Formats how long a portfolio has run: "2 yıl 1 ay", or "20 gün" under a month. */
export function useDuration() {
  const { t } = useTranslation();
  return (start: string | null, end: string | null) => {
    if (!start || !end) return null;
    const { years, months, days } = elapsed(start, end);
    const parts =
      years || months
        ? [
            years > 0 && t('explore.duration.years', { count: years }),
            months > 0 && t('explore.duration.months', { count: months }),
          ].filter(Boolean)
        : [t('explore.duration.days', { count: days })];
    return parts.join(' ');
  };
}

/** Formats a portfolio's time span: "Başlangıç Ekim 2024 · 2 yıl 1 ay". */
export function useHorizon(fmt: Formatters) {
  const { t } = useTranslation();
  const durationOf = useDuration();
  return (start: string | null, end: string | null) => {
    const duration = durationOf(start, end);
    if (!start || !duration) return null;
    return t('explore.horizon', { start: fmt.month(start.slice(0, 7)), duration });
  };
}
