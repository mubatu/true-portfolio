import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Layers, Mountain, Sparkles, Trophy, type LucideIcon } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { plColor, type Formatters } from './format';
import { dailyExtremes, periodStats, sliceRange, type DayMove } from './performance';
import type { PerformancePoint, Position } from './types';

/**
 * What the numbers say, in plain sentences: the unit price's best and
 * worst day, the best and worst stocks, how far it is from its peak, and
 * how concentrated it is. (How it did against BIST 100, gold and the
 * dollar is the returns table's job.)
 *
 * ``kind="portfolio"`` (the Overview) reads each "position" as a whole
 * portfolio: best/worst portfolio, and concentration as the largest one.
 */
export function Insights({
  points,
  positions,
  fmt,
  displayTicker,
  kind = 'stock',
}: {
  points: PerformancePoint[];
  positions: Position[];
  fmt: Formatters;
  displayTicker: (ticker: string) => string;
  kind?: 'stock' | 'portfolio';
}) {
  const { t } = useTranslation();
  const topCount = kind === 'portfolio' ? 1 : 3;

  const data = useMemo(() => {
    const all = sliceRange(points, 'ALL');
    const stats = periodStats(all);
    const days = dailyExtremes(points);
    const ranked = [...positions].sort((a, b) => b.total_pl - a.total_pl);
    const open = positions.filter((p) => p.quantity > 0).sort((a, b) => b.weight_pct - a.weight_pct);
    const top = open.slice(0, topCount);
    return {
      stats,
      days,
      best: ranked[0] && ranked[0].total_pl > 0 ? ranked[0] : null,
      worst: ranked.length > 0 && ranked[ranked.length - 1].total_pl < 0 ? ranked[ranked.length - 1] : null,
      top,
      topShare: top.reduce((s, p) => s + p.weight_pct, 0),
      openCount: open.length,
    };
  }, [points, positions, topCount]);

  const { stats } = data;
  if (!stats) return null;

  return (
    <Panel className="p-4 md:p-6 mb-6" aria-labelledby="insights-title">
      <PanelHeader id="insights-title" icon={Sparkles} title={t('analyze.insights.title')} description={t('analyze.insights.hint')} className="mb-4" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Insight icon={Activity} label={t('analyze.insights.days')}>
          {data.days ? (
            <>
              <DayRow label={t('analyze.returns.bestDay')} move={data.days.best} fmt={fmt} />
              <DayRow label={t('analyze.returns.worstDay')} move={data.days.worst} fmt={fmt} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('analyze.insights.noDays')}</p>
          )}
        </Insight>

        <Insight icon={Trophy} label={t('analyze.insights.bestWorst')}>
          {data.best ? (
            <Mover label={t('analyze.insights.best')} ticker={displayTicker(data.best.ticker)} value={fmt.signedMoney(data.best.total_pl)} pct={fmt.pct(data.best.total_pl_pct)} tone={1} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(kind === 'portfolio' ? 'overview.insights.noWinner' : 'analyze.insights.noWinner')}
            </p>
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
                {t(kind === 'portfolio' ? 'overview.insights.largest' : 'analyze.insights.topHoldings', {
                  count: data.top.length,
                  total: data.openCount,
                })}
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
            <p className="text-sm text-muted-foreground">
              {t(kind === 'portfolio' ? 'overview.insights.noOpen' : 'analyze.insights.noOpen')}
            </p>
          )}
        </Insight>
      </div>
    </Panel>
  );
}

function Insight({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border bg-background/40 p-4 flex flex-col">
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      {children}
    </div>
  );
}

/** A day's unit price move, laid out like a mover: label and date, then the change. */
function DayRow({ label, move, fmt }: { label: string; move: DayMove; fmt: Formatters }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 first:pt-0 border-b last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold truncate">{fmt.date(move.date)}</p>
      </div>
      <p className="font-semibold tabular-nums" style={{ color: plColor(move.pct) }}>
        {fmt.pct(move.pct)}
      </p>
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
      <div className="shrink-0 text-right">
        <p className="font-semibold tabular-nums whitespace-nowrap" style={{ color: plColor(tone) }}>{value}</p>
        <p className="text-xs tabular-nums" style={{ color: plColor(tone) }}>{pct}</p>
      </div>
    </div>
  );
}
