import { useTranslation } from 'react-i18next';
import type { Formatters } from '@/components/analysis/format';
import { elapsed } from './publicData';

/** Formats a portfolio's time span: "Başlangıç Ekim 2024 · 2 yıl 1 ay". */
export function useHorizon(fmt: Formatters) {
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
    return t('explore.horizon', { start: fmt.month(start.slice(0, 7)), duration: parts.join(' ') });
  };
}
