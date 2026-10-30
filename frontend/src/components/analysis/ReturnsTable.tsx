import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { plColor, type Formatters } from './format';
import { annualizedVolatility, dailyReturns, periodReturns } from './performance';
import type { PerformancePoint } from './types';

/** Fund-style return table: portfolio vs. BIST 100 over standard periods. */
export function ReturnsTable({ points, fmt }: { points: PerformancePoint[]; fmt: Formatters }) {
  const { t } = useTranslation();
  const rows = useMemo(() => periodReturns(points), [points]);
  const volatility = useMemo(() => annualizedVolatility(points), [points]);
  const extremes = useMemo(() => {
    const daily = dailyReturns(points);
    let best = 1;
    let worst = 1;
    for (let i = 1; i < daily.length; i++) {
      if (daily[i] > daily[best]) best = i;
      if (daily[i] < daily[worst]) worst = i;
    }
    return points.length > 1
      ? { best: { pct: daily[best], date: points[best].date }, worst: { pct: daily[worst], date: points[worst].date } }
      : null;
  }, [points]);

  if (rows.length === 0) return null;

  const cell = (v: number | null, signed = true) =>
    v == null ? (
      <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>
    ) : (
      <span className="font-medium tabular-nums" style={{ color: signed ? plColor(v) : undefined }}>
        {fmt.pct(v)}
      </span>
    );

  return (
    <section
      className="rounded-2xl border p-4 md:p-6 mb-6"
      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
      aria-labelledby="returns-title"
    >
      <h2 id="returns-title" className="text-lg font-semibold mb-1">
        {t('analyze.returns.title')}
      </h2>
      <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {t('analyze.returns.hint')}
      </p>

      <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr style={{ color: 'hsl(var(--muted-foreground))' }}>
              <th scope="col" className="text-left font-medium py-2 pr-4" />
              {rows.map((r) => (
                <th key={r.range} scope="col" className="text-right font-medium py-2 px-2">
                  {t(`analyze.returns.periods.${r.range}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <th scope="row" className="text-left font-semibold py-2.5 pr-4">
                {t('analyze.performance.portfolio')}
              </th>
              {rows.map((r) => (
                <td key={r.range} className="text-right py-2.5 px-2">
                  {cell(r.returnPct)}
                </td>
              ))}
            </tr>
            <tr className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <th scope="row" className="text-left font-medium py-2.5 pr-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {t('analyze.performance.benchmark')}
              </th>
              {rows.map((r) => (
                <td key={r.range} className="text-right py-2.5 px-2">
                  {cell(r.benchmarkPct)}
                </td>
              ))}
            </tr>
            <tr className="border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <th scope="row" className="text-left font-medium py-2.5 pr-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {t('analyze.returns.difference')}
              </th>
              {rows.map((r) => {
                const diff = r.returnPct != null && r.benchmarkPct != null ? r.returnPct - r.benchmarkPct : null;
                return (
                  <td key={r.range} className="text-right py-2.5 px-2 tabular-nums">
                    {diff == null ? (
                      <span style={{ color: 'hsl(var(--muted-foreground))' }}>—</span>
                    ) : (
                      <span className="font-medium" style={{ color: plColor(diff) }}>
                        {t('analyze.returns.points', { value: fmt.points(diff) })}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {(volatility != null || extremes) && (
        <dl className="flex flex-wrap gap-x-8 gap-y-2 mt-4 text-sm">
          {volatility != null && (
            <div className="flex gap-2">
              <dt style={{ color: 'hsl(var(--muted-foreground))' }} title={t('analyze.returns.volatilityHint')}>
                {t('analyze.returns.volatility')}
              </dt>
              <dd className="font-medium tabular-nums">{fmt.share(volatility)}</dd>
            </div>
          )}
          {extremes && (
            <>
              <div className="flex gap-2">
                <dt style={{ color: 'hsl(var(--muted-foreground))' }}>{t('analyze.returns.bestDay')}</dt>
                <dd className="font-medium tabular-nums" style={{ color: plColor(extremes.best.pct) }}>
                  {fmt.pct(extremes.best.pct)}
                  <span className="font-normal ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    ({fmt.date(extremes.best.date)})
                  </span>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt style={{ color: 'hsl(var(--muted-foreground))' }}>{t('analyze.returns.worstDay')}</dt>
                <dd className="font-medium tabular-nums" style={{ color: plColor(extremes.worst.pct) }}>
                  {fmt.pct(extremes.worst.pct)}
                  <span className="font-normal ml-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    ({fmt.date(extremes.worst.date)})
                  </span>
                </dd>
              </div>
            </>
          )}
        </dl>
      )}
    </section>
  );
}
