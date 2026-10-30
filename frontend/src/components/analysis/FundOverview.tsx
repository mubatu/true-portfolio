import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { plBg, plColor, type Formatters } from './format';
import { dailyReturns, unitPrice } from './performance';
import type { AnalysisTotals, DividendSummary, PerformancePoint } from './types';

/**
 * Fund-style header: the portfolio's unit price (starts at 1.0000 and moves
 * only with performance) with its daily change, next to the fund's size
 * and the money view (invested, P/L, cash, dividends, commission).
 */
export function FundOverview({
  points,
  totals,
  dividends,
  fmt,
}: {
  points: PerformancePoint[];
  totals: AnalysisTotals;
  dividends: DividendSummary;
  fmt: Formatters;
}) {
  const { t } = useTranslation();
  const last = points[points.length - 1];
  const daily = points.length >= 2 ? dailyReturns(points.slice(-2))[1] : null;
  const sinceStart = last ? (unitPrice(last) - 1) * 100 : null;

  return (
    <section
      className="rounded-2xl border p-5 md:p-6 mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"
      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
      aria-label={t('analyze.fund.overview')}
    >
      <div className="flex flex-col justify-center">
        <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {t('analyze.fund.unitPrice')}
        </span>
        {last ? (
          <>
            <div className="flex flex-wrap items-baseline gap-3 mt-1">
              <span className="text-4xl md:text-5xl font-bold tabular-nums tracking-tight">
                {fmt.unit(unitPrice(last))}
              </span>
              {daily != null && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-semibold tabular-nums"
                  style={{ backgroundColor: plBg(daily), color: plColor(daily) }}
                >
                  {daily >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {fmt.pct(daily)}
                </span>
              )}
            </div>
            <p className="text-sm mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {t('analyze.fund.asOf', { date: fmt.date(last.date) })}
              {sinceStart != null && (
                <>
                  {' · '}
                  {t('analyze.fund.sinceStart')}{' '}
                  <span className="font-medium" style={{ color: plColor(sinceStart) }}>
                    {fmt.pct(sinceStart)}
                  </span>
                </>
              )}
            </p>
            <p className="text-xs mt-3 max-w-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {t('analyze.fund.unitPriceHint')}
            </p>
          </>
        ) : (
          <span className="text-4xl font-bold mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            —
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-px rounded-xl overflow-hidden border" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--border))' }}>
        <Metric label={t('analyze.fund.size')} value={fmt.money(totals.portfolio_value + totals.in_the_safe)} />
        <Metric label={t('analyze.totalInvested')} value={fmt.money(totals.total_invested)} />
        <Metric
          label={t('analyze.totalPl')}
          value={fmt.signedMoney(totals.total_pl)}
          sub={fmt.pct(totals.total_pl_pct)}
          tone={totals.total_pl}
        />
        <Metric label={t('analyze.portfolioValue')} value={fmt.money(totals.portfolio_value)} />
        <Metric label={t('analyze.inTheSafe')} value={fmt.money(totals.in_the_safe)} />
        <Metric
          label={t('analyze.dividendIncome')}
          value={fmt.money(totals.dividend_income)}
          sub={
            <>
              {t('analyze.dividendIncomeSub', { gross: fmt.money(dividends.total_gross) })}
              {' · '}
              {t('analyze.commissionPaid', { amount: fmt.money(totals.commission_paid) })}
            </>
          }
        />
      </dl>
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  /** Colors the value green/red by sign. */
  tone?: number;
}) {
  return (
    <div className="p-4 flex flex-col gap-1 min-w-0" style={{ backgroundColor: 'hsl(var(--card))' }}>
      <dt className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {label}
      </dt>
      <dd
        className="text-lg font-semibold tabular-nums truncate"
        style={{ color: tone != null ? plColor(tone) : 'hsl(var(--foreground))' }}
      >
        {value}
      </dd>
      {sub && (
        <dd className="text-xs tabular-nums" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {sub}
        </dd>
      )}
    </div>
  );
}
