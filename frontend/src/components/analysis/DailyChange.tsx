import { useTranslation } from 'react-i18next';
import { addDaysIso, todayIso } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { plBg, plColor, type Formatters } from './format';
import { dailyReturns } from './performance';
import type { PerformancePoint } from './types';

/**
 * Unit price change on the last close, labelled with that close's day:
 * "Bugün −%3,36", "Dün …", or its date ("24 Eki …"). The last close is the
 * last settled day, so before 19:00, on weekends and on holidays it is not
 * today. Renders nothing with fewer than two days.
 */
export function DailyChange({
  points,
  fmt,
  size = 'md',
  className,
}: {
  points: PerformancePoint[];
  fmt: Formatters;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { t } = useTranslation();
  if (points.length < 2) return null;

  const change = dailyReturns(points.slice(-2))[1];
  const date = points[points.length - 1].date;
  const today = todayIso();
  const day =
    date === today
      ? t('analyze.daily.today')
      : date === addDaysIso(today, -1)
        ? t('analyze.daily.yesterday')
        : fmt.shortDate(date);

  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1.5 rounded-full font-semibold tabular-nums whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-sm',
        className
      )}
      style={{ backgroundColor: plBg(change), color: plColor(change) }}
      title={t('analyze.daily.hint', { date: fmt.date(date) })}
    >
      <span className="font-medium opacity-80">{day}</span>
      {fmt.pct(change)}
    </span>
  );
}
