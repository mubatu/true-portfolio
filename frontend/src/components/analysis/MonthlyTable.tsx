import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { plBg, plColor, type Formatters } from './format';
import { monthlyBreakdown } from './performance';
import type { PerformancePoint } from './types';

const INITIAL_ROWS = 12;

export function MonthlyTable({
  points,
  fmt,
}: {
  points: PerformancePoint[];
  fmt: Formatters;
}) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => monthlyBreakdown(points), [points]);

  if (rows.length === 0) return null;
  const visible = showAll ? rows : rows.slice(0, INITIAL_ROWS);

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-1">{t('analyze.monthly.title')}</h2>
      <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {t('analyze.monthly.hint')}
      </p>

      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}>
                <Th align="left">{t('analyze.monthly.month')}</Th>
                <Th>{t('analyze.monthly.value')}</Th>
                <Th>{t('analyze.monthly.invested')}</Th>
                <Th>{t('analyze.monthly.totalPl')}</Th>
                <Th>{t('analyze.monthly.plChange')}</Th>
                <Th>{t('analyze.monthly.return')}</Th>
                <Th>{t('analyze.monthly.benchmark')}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.month}
                  className="border-t transition-colors hover:bg-muted/50"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{fmt.month(row.month)}</td>
                  <td className="text-right px-4 py-3">{fmt.money(row.totalValue)}</td>
                  <td className="text-right px-4 py-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {fmt.money(row.invested)}
                  </td>
                  <td className="text-right px-4 py-3 whitespace-nowrap" style={{ color: plColor(row.totalPl) }}>
                    {fmt.money(row.totalPl)}
                    <span className="text-xs ml-1">({fmt.pct(row.plPct)})</span>
                  </td>
                  <td className="text-right px-4 py-3" style={{ color: plColor(row.plChange) }}>
                    {row.plChange >= 0 ? '+' : ''}
                    {fmt.money(row.plChange)}
                  </td>
                  <td className="text-right px-4 py-3">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-sm font-medium"
                      style={{ backgroundColor: plBg(row.returnPct), color: plColor(row.returnPct) }}
                    >
                      {fmt.pct(row.returnPct)}
                    </span>
                  </td>
                  <td className="text-right px-4 py-3 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {row.benchmarkReturnPct != null ? fmt.pct(row.benchmarkReturnPct) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rows.length > INITIAL_ROWS && (
        <div className="mt-3 text-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll
              ? t('analyze.monthly.showLess')
              : t('analyze.monthly.showAll', { count: rows.length })}
          </Button>
        </div>
      )}
    </section>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`text-${align} px-4 py-3 text-sm font-medium whitespace-nowrap`}>{children}</th>
  );
}
