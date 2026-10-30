import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

/** Placeholder of the analysis layout while the first sync runs. */
export function AnalysisSkeleton() {
  const { t } = useTranslation();
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="text-sm mb-4 inline-flex items-center gap-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
        <RefreshCw className="h-4 w-4 animate-spin" />
        {t('analyze.loading')}
      </p>
      <div className="rounded-2xl border p-6 mb-6 grid gap-6 lg:grid-cols-[1fr_1.6fr]" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="space-y-3">
          <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          <div className="h-12 w-48 rounded bg-muted animate-pulse" />
          <div className="h-4 w-56 rounded bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border p-6 mb-6" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="h-[300px] rounded-lg bg-muted animate-pulse" />
      </div>
    </div>
  );
}
