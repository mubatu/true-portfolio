import { TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/** App mark (and name): a rounded primary tile with a rising line. */
export function Logo({ showName = true, className, inverted }: { showName?: boolean; className?: string; inverted?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-xl shadow-sm',
          inverted ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-primary text-primary-foreground'
        )}
      >
        <TrendingUp className="h-5 w-5" aria-hidden="true" />
      </span>
      {showName && <span className="text-lg font-semibold tracking-tight">{t('common.appName')}</span>}
    </span>
  );
}
