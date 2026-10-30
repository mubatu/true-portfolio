import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, CircleDollarSign, Coins, PiggyBank, Wallet } from 'lucide-react';
import { plColor, type Formatters } from './format';
import type { AnalysisTotals, DividendSummary } from './types';

export function SummaryCards({
  totals,
  dividends,
  fmt,
}: {
  totals: AnalysisTotals;
  dividends: DividendSummary;
  fmt: Formatters;
}) {
  const { t } = useTranslation();
  const plTint = plColor(totals.total_pl);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-8">
      {/* Money brought in from outside (pocket) */}
      <SummaryCard
        icon={<Wallet className="h-5 w-5 text-primary" />}
        label={t('analyze.totalInvested')}
        value={fmt.money(totals.total_invested)}
      />
      <SummaryCard
        icon={<CircleDollarSign className="h-5 w-5 text-primary" />}
        label={t('analyze.portfolioValue')}
        value={fmt.money(totals.portfolio_value)}
      />
      <SummaryCard
        icon={<PiggyBank className="h-5 w-5 text-primary" />}
        label={t('analyze.inTheSafe')}
        value={fmt.money(totals.in_the_safe)}
      />
      {/* Net dividends, already included in Total P/L */}
      <SummaryCard
        icon={<Coins className="h-5 w-5 text-primary" />}
        label={t('analyze.dividendIncome')}
        value={fmt.money(totals.dividend_income)}
        sub={t('analyze.dividendIncomeSub', { gross: fmt.money(dividends.total_gross) })}
        color={dividends.total_gross > 0 ? undefined : 'hsl(var(--muted-foreground))'}
      />
      <SummaryCard
        icon={<BarChart3 className="h-5 w-5" style={{ color: plTint }} />}
        label={t('analyze.totalPl')}
        value={fmt.money(totals.total_pl)}
        sub={fmt.pct(totals.total_pl_pct)}
        color={plTint}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-2"
      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
        >
          {icon}
        </div>
        <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {label}
        </span>
      </div>
      <span className="text-2xl font-bold" style={{ color: color ?? 'hsl(var(--foreground))' }}>
        {value}
      </span>
      {sub && (
        <span className="text-sm font-medium" style={{ color }}>
          {sub}
        </span>
      )}
    </div>
  );
}
