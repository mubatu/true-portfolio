import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Equal, Plus, type LucideIcon } from 'lucide-react';
import { InfoNote, Panel } from '@/components/ui/Panel';
import { cn } from '@/lib/utils';
import { DailyChange } from './DailyChange';
import { plColor, type Formatters } from './format';
import { unitPrice } from './performance';
import type { AnalysisTotals, DividendSummary, PerformancePoint } from './types';

/**
 * Fund-style header: the portfolio's unit price (starts at 1.0000 and moves
 * only with performance) with its daily change, next to the money view,
 * laid out as one sum on a shared grid so the relations show:
 *   invested + realized P/L + net dividends + unrealized P/L
 *   = current total value, in the invested column below;
 *   and the three P/L parts = total P/L, spanning their columns below.
 * A P/L part that is zero (no dividends, nothing sold yet, nothing held)
 * drops out; unrealized P/L stays when all three are zero, so the sum still
 * reads. On a narrow panel the boxes stack, signs on their top edges; the
 * total P/L's = shows only side by side, where it sits under the parts it sums.
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
  const sinceStart = last ? (unitPrice(last) - 1) * 100 : null;
  const parts = (
    [
      {
        key: 'realized',
        label: t('analyze.realizedPl'),
        value: totals.realized_pl,
        sub: t('analyze.realizedPlSub'),
      },
      {
        key: 'dividends',
        label: t('analyze.dividendIncome'),
        value: totals.dividend_income,
        sub: t('analyze.dividendIncomeSub', { gross: fmt.money(dividends.total_gross) }),
      },
      {
        key: 'unrealized',
        label: t('analyze.unrealizedPl'),
        value: totals.unrealized_pl,
        sub: t('analyze.unrealizedPlSub'),
      },
    ] as const
  ).filter((part, _, all) =>
    all.every((p) => isZero(p.value)) ? part.key === 'unrealized' : !isZero(part.value)
  );

  return (
    <Panel
      className="p-5 md:p-6 mb-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
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
              <DailyChange points={points} fmt={fmt} />
            </div>
            <p className="text-sm mt-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {t('analyze.fund.asOf', { date: fmt.date(last.date) })}
              {sinceStart != null && (
                <>
                  {' · '}
                  {t('analyze.fund.sinceStart')}{' '}
                  <span className="font-medium whitespace-nowrap" style={{ color: plColor(sinceStart) }}>
                    {fmt.pct(sinceStart)}
                  </span>
                </>
              )}
            </p>
            <InfoNote className="mt-3 max-w-sm">{t('analyze.fund.unitPriceHint')}</InfoNote>
          </>
        ) : (
          <span className="text-4xl font-bold mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            —
          </span>
        )}
      </div>

      <div className="@container min-w-0">
        {/* Not clipped: the = of the value sits on the outer left edge, so
            the corner boxes round themselves. */}
        <dl
          className={cn(
            'grid grid-cols-1 gap-px rounded-xl border',
            // The money column (invested, value) wider; the P/L parts even.
            GRID_COLUMNS[parts.length]
          )}
          style={{ backgroundColor: 'hsl(var(--border))' }}
        >
          <Metric
            label={t('analyze.totalInvested')}
            value={fmt.money(totals.total_invested)}
            className="rounded-t-[11px] @xl:rounded-tr-none"
          />
          {parts.map((part, i) => (
            <Metric
              key={part.key}
              label={part.label}
              value={fmt.signedMoney(part.value)}
              sub={part.sub}
              tone={part.value}
              sign={{ icon: Plus, layout: '@xl' }}
              className={i === parts.length - 1 ? '@xl:rounded-tr-[11px]' : undefined}
            />
          ))}
          <Metric
            label={t('analyze.fund.currentValue')}
            value={fmt.money(totals.portfolio_value + totals.in_the_safe)}
            sub={
              // Breaks only at the plus, never inside "Nakit ₺1.250,40".
              <>
                <span className="whitespace-nowrap">{t('analyze.fund.holdingsPart', { value: fmt.money(totals.portfolio_value) })}</span>
                {' + '}
                <span className="whitespace-nowrap">{t('analyze.fund.cashPart', { value: fmt.money(totals.in_the_safe) })}</span>
              </>
            }
            sign={{ icon: Equal, layout: '@xl' }}
            result
            className="@xl:rounded-bl-[11px]"
          />
          <Metric
            label={t('analyze.totalPl')}
            value={fmt.signedMoney(totals.total_pl)}
            sub={fmt.pct(totals.total_pl_pct)}
            tone={totals.total_pl}
            sign={{ icon: Equal, layout: 'top-@xl' }}
            result
            className={cn(
              'rounded-b-[11px] @xl:rounded-bl-none @xl:items-center @xl:text-center',
              TOTAL_SPAN[parts.length]
            )}
          />
        </dl>
        <p className="sr-only">{t('analyze.plEquation')}</p>
        <p className="text-xs mt-2 text-muted-foreground">
          {t('analyze.commissionNote', { commission: fmt.money(totals.commission_paid) })}
        </p>
      </div>
    </Panel>
  );
}

/** Below a kuruş: shown as zero, so the box is left out. */
const isZero = (value: number) => Math.abs(value) < 0.005;

// By the number of P/L parts shown; spelled out so Tailwind sees each class.
const GRID_COLUMNS: Record<number, string> = {
  1: '@xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]',
  2: '@xl:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))]',
  3: '@xl:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]',
};
const TOTAL_SPAN: Record<number, string> = {
  1: '@xl:col-span-1',
  2: '@xl:col-span-2',
  3: '@xl:col-span-3',
};

/**
 * A sign on a box's edge: ``@xl`` sits on the left edge once the grid lays
 * out side by side (a container size) and on the top edge while the boxes
 * stack; ``top-@xl`` sits on the top edge and only side by side.
 */
type Sign = { icon: LucideIcon; layout: '@xl' | 'top-@xl' };

// Spelled out so Tailwind sees each class.
const SIGN_PLACEMENT = {
  '@xl': '@xl:left-0 @xl:top-1/2 @xl:-translate-x-1/2 @xl:-translate-y-1/2',
  'top-@xl': 'hidden @xl:flex',
} as const;

function Metric({
  label,
  value,
  sub,
  tone,
  sign,
  result,
  className,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  /** Colors the value green/red by sign. */
  tone?: number;
  sign?: Sign;
  /** The equation's result: tinted, bolder. */
  result?: boolean;
  /** Corner rounding and column span in the grid. */
  className?: string;
}) {
  return (
    <div
      className={cn('relative p-4 flex flex-col gap-1 min-w-0', result ? 'bg-muted' : 'bg-card', className)}
    >
      {sign && (
        <span
          className={cn(
            'absolute z-10 left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm',
            SIGN_PLACEMENT[sign.layout]
          )}
          aria-hidden="true"
        >
          <sign.icon className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      )}
      <dt className={cn('text-xs text-muted-foreground', result && 'font-medium text-foreground')}>{label}</dt>
      <dd
        className={cn('tabular-nums truncate', result ? 'text-xl font-bold' : 'text-lg font-semibold')}
        style={{ color: tone != null ? plColor(tone) : 'hsl(var(--foreground))' }}
      >
        {value}
      </dd>
      {sub && <dd className="text-xs tabular-nums text-muted-foreground">{sub}</dd>}
    </div>
  );
}
