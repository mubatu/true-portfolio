import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownRight, ArrowUpRight, Layers, Mountain, Scale, Sparkles, Trophy, type LucideIcon } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { plColor, type Formatters } from './format';
import { comparisonChange, periodStats, sliceRange, type ComparisonField } from './performance';
import type { PerformancePoint, Position } from './types';

const COMPARISONS: { key: string; field: ComparisonField; color: string }[] = [
  { key: 'benchmark', field: 'benchmark_close', color: 'hsl(var(--muted-foreground))' },
  { key: 'gold', field: 'gold_close', color: 'var(--series-gold)' },
  { key: 'usd', field: 'usd_close', color: 'var(--series-usd)' },
];

/**
 * What the numbers say, in plain sentences: how the portfolio did against
 * BIST 100, gold and the dollar, its best and worst stocks, how far it is
 * from its peak, and how concentrated it is.
 */
export function Insights({
  points,
  positions,
  fmt,
  displayTicker,
}: {
  points: PerformancePoint[];
  positions: Position[];
  fmt: Formatters;
  displayTicker: (ticker: string) => string;
}) {
  const { t } = useTranslation();

  const data = useMemo(() => {
    const all = sliceRange(points, 'ALL');
    const stats = periodStats(all);
    const comparisons = COMPARISONS.map((c) => ({ ...c, pct: comparisonChange(all, c.field) })).filter(
      (c): c is typeof c & { pct: number } => c.pct != null
    );
    const ranked = [...positions].sort((a, b) => b.total_pl - a.total_pl);
    const open = positions.filter((p) => p.quantity > 0).sort((a, b) => b.weight_pct - a.weight_pct);
    const top = open.slice(0, 3);
    return {
      stats,
      comparisons,
      best: ranked[0] && ranked[0].total_pl > 0 ? ranked[0] : null,
      worst: ranked.length > 0 && ranked[ranked.length - 1].total_pl < 0 ? ranked[ranked.length - 1] : null,
      top,
      topShare: top.reduce((s, p) => s + p.weight_pct, 0),
      openCount: open.length,
    };
  }, [points, positions]);

  const { stats } = data;
  if (!stats) return null;

  return (
    <Panel className="p-4 md:p-6 mb-6" aria-labelledby="insights-title">
      <PanelHeader id="insights-title" icon={Sparkles} title={t('analyze.insights.title')} description={t('analyze.insights.hint')} className="mb-4" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Insight icon={Scale} label={t('analyze.insights.vsMarkets')}>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: plColor(stats.returnPct) }}>
            {fmt.pct(stats.returnPct)}
          </p>
          <p className="text-xs text-muted-foreground mb-2">{t('analyze.insights.sinceStart', { date: fmt.date(stats.startDate) })}</p>
          <ul className="space-y-1">
            {data.comparisons.map((c) => {
              const diff = stats.returnPct - c.pct;
              const Arrow = diff >= 0 ? ArrowUpRight : ArrowDownRight;
              return (
                <li key={c.key} className="flex items-center gap-2 text-sm" title={`${t(`analyze.chart.comparisons.${c.key}`)} ${fmt.pct(c.pct)}`}>
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} aria-hidden="true" />
                  <span className="text-muted-foreground whitespace-nowrap">{t(`analyze.chart.comparisons.${c.key}`)}</span>
                  <span className="ml-auto inline-flex items-center gap-0.5 font-medium tabular-nums whitespace-nowrap" style={{ color: plColor(diff) }}>
                    <Arrow className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(diff >= 0 ? 'analyze.insights.ahead' : 'analyze.insights.behind', { value: fmt.points(Math.abs(diff)).replace(/^\+/, '') })}
                  </span>
                </li>
              );
            })}
          </ul>
        </Insight>

        <Insight icon={Trophy} label={t('analyze.insights.bestWorst')}>
          {data.best ? (
            <Mover label={t('analyze.insights.best')} ticker={displayTicker(data.best.ticker)} value={fmt.signedMoney(data.best.total_pl)} pct={fmt.pct(data.best.total_pl_pct)} tone={1} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('analyze.insights.noWinner')}</p>
          )}
          {data.worst && (
            <Mover label={t('analyze.insights.worst')} ticker={displayTicker(data.worst.ticker)} value={fmt.signedMoney(data.worst.total_pl)} pct={fmt.pct(data.worst.total_pl_pct)} tone={-1} />
          )}
        </Insight>

        <Insight icon={Mountain} label={t('analyze.insights.fromPeak')}>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: stats.currentDrawdownPct < 0 ? plColor(-1) : plColor(1) }}>
            {stats.currentDrawdownPct < -0.005 ? fmt.pct(stats.currentDrawdownPct) : t('analyze.insights.atPeak')}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats.maxDrawdown
              ? t('analyze.insights.maxDrawdown', { value: fmt.pct(stats.maxDrawdown.pct), date: fmt.date(stats.maxDrawdown.troughDate) })
              : t('analyze.insights.noDrawdown')}
          </p>
        </Insight>

        <Insight icon={Layers} label={t('analyze.insights.concentration')}>
          {data.openCount > 0 ? (
            <>
              <p className="text-2xl font-semibold tabular-nums">{fmt.share(data.topShare)}</p>
              <p className="text-xs text-muted-foreground mb-2">
                {t('analyze.insights.topHoldings', { count: data.top.length, total: data.openCount })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {data.top.map((p) => (
                  <span key={p.ticker} className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted tabular-nums">
                    {displayTicker(p.ticker)} {fmt.share(p.weight_pct)}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('analyze.insights.noOpen')}</p>
          )}
        </Insight>
      </div>
    </Panel>
  );
}

function Insight({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-background/40 p-4 flex flex-col">
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      {children}
    </div>
  );
}

function Mover({ label, ticker, value, pct, tone }: { label: string; ticker: string; value: string; pct: string; tone: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 first:pt-0 border-b last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold truncate">{ticker}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold tabular-nums" style={{ color: plColor(tone) }}>{value}</p>
        <p className="text-xs tabular-nums" style={{ color: plColor(tone) }}>{pct}</p>
      </div>
    </div>
  );
}
