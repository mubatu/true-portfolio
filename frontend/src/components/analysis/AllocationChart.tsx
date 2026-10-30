import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { useTheme } from '@/hooks/useTheme';
import type { Formatters } from './format';
import { SERIES_LIGHT, categoricalColors } from './palette';
import type { Position } from './types';

const CASH = 'hsl(var(--muted-foreground) / 0.45)';
const OTHER = 'hsl(var(--muted-foreground) / 0.7)';
const MAX_SLICES = SERIES_LIGHT.length;

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Where the money is now: open positions by market value, plus cash.
 * ``hideAmounts`` (Explore): values are already percentages; only shares
 * are shown, with the holding count in the middle.
 */
export function AllocationChart({
  positions,
  cash,
  fmt,
  displayTicker,
  title,
  hideAmounts = false,
  colorOf: fixedColors,
}: {
  positions: Position[];
  cash: number;
  fmt: Formatters;
  displayTicker: (ticker: string) => string;
  /** Defaults to the per-stock "Allocation". */
  title?: string;
  hideAmounts?: boolean;
  /** Fixed colors by ticker, to match another chart on the page. */
  colorOf?: Map<string, string>;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const slices: Slice[] = useMemo(() => {
    const open = positions.filter((p) => p.quantity > 0 && p.market_value > 0);
    const bySize = [...open].sort((a, b) => b.market_value - a.market_value);
    const shown = bySize.length > MAX_SLICES ? bySize.slice(0, MAX_SLICES - 1) : bySize;
    // Colors follow the stock (alphabetical among the slices shown), never
    // its rank by size; at most one slot each, never cycled.
    const colorOf = fixedColors ?? categoricalColors(shown.map((p) => p.ticker), theme === 'dark' ? 'dark' : 'light');
    const rest = bySize.slice(shown.length);

    const result: Slice[] = shown.map((p) => ({
      key: p.ticker,
      label: displayTicker(p.ticker),
      value: p.market_value,
      color: colorOf.get(p.ticker)!,
    }));
    if (rest.length > 0) {
      result.push({
        key: 'other',
        label: t('analyze.allocation.other', { count: rest.length }),
        value: rest.reduce((a, p) => a + p.market_value, 0),
        color: OTHER,
      });
    }
    if (cash > 0.005) {
      result.push({ key: 'cash', label: t('analyze.allocation.cash'), value: cash, color: CASH });
    }
    return result;
  }, [positions, cash, theme, fixedColors, displayTicker, t]);

  const total = slices.reduce((a, s) => a + s.value, 0);
  if (slices.length === 0 || total <= 0) return null;

  return (
    <Panel className="p-4 md:p-6 @container" aria-labelledby="allocation-title">
      <PanelHeader id="allocation-title" icon={PieChartIcon} title={title ?? t('analyze.allocation.title')} className="mb-4" />
      {/* Side by side only when the panel itself is wide enough; in the
          narrow column next to the returns table the legend goes below. */}
      <div className="flex flex-col @md:flex-row items-center gap-6">
        <div className="relative h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius="64%"
                outerRadius="100%"
                paddingAngle={slices.length > 1 ? 1.5 : 0}
                stroke="hsl(var(--card))"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {slices.map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  const s = active ? (payload?.[0]?.payload as Slice | undefined) : undefined;
                  if (!s) return null;
                  return (
                    <div
                      className="rounded-lg border px-3 py-2 text-sm shadow-lg"
                      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--popover))' }}
                    >
                      <p className="font-medium">{s.label}</p>
                      <p className="tabular-nums" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {hideAmounts ? fmt.share((s.value / total) * 100) : `${fmt.money(s.value)} · ${fmt.share((s.value / total) * 100)}`}
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {hideAmounts ? (
              <span className="text-sm font-semibold tabular-nums text-center px-2">
                {t('explore.holdings', { count: positions.filter((p) => p.quantity > 0).length })}
              </span>
            ) : (
              <>
                <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {t('analyze.fund.size')}
                </span>
                <span className="text-sm font-semibold tabular-nums">{fmt.compactMoney(total)}</span>
              </>
            )}
          </div>
        </div>

        {/* min-w-0 down the chain, so long names (portfolios) truncate
            instead of running into the share column. */}
        <ul className="w-full min-w-0 space-y-2 text-sm">
          {slices.map((s) => (
            <li key={s.key} className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span className="font-medium truncate min-w-0" title={s.label}>
                {s.label}
              </span>
              <span className="ml-auto pl-2 shrink-0 tabular-nums" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {fmt.share((s.value / total) * 100)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
