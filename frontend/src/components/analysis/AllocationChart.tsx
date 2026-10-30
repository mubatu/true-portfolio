import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useTheme } from '@/hooks/useTheme';
import type { Formatters } from './format';
import type { Position } from './types';

// Validated categorical palette (dataviz reference, CVD-checked), used in
// fixed order; light and dark steps are chosen per surface.
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9'];
const CASH = 'hsl(var(--muted-foreground) / 0.45)';
const OTHER = 'hsl(var(--muted-foreground) / 0.7)';
const MAX_SLICES = SERIES_LIGHT.length;

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Where the money is now: open positions by market value, plus cash. */
export function AllocationChart({
  positions,
  cash,
  fmt,
  displayTicker,
}: {
  positions: Position[];
  cash: number;
  fmt: Formatters;
  displayTicker: (ticker: string) => string;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const palette = theme === 'dark' ? SERIES_DARK : SERIES_LIGHT;

  const slices: Slice[] = useMemo(() => {
    const open = positions.filter((p) => p.quantity > 0 && p.market_value > 0);
    // Colors follow the stock (alphabetical), never its rank by size.
    const colorOf = new Map(
      [...open].sort((a, b) => a.ticker.localeCompare(b.ticker)).map((p, i) => [p.ticker, palette[i % palette.length]])
    );
    const bySize = [...open].sort((a, b) => b.market_value - a.market_value);
    const shown = bySize.length > MAX_SLICES ? bySize.slice(0, MAX_SLICES - 1) : bySize;
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
  }, [positions, cash, palette, displayTicker, t]);

  const total = slices.reduce((a, s) => a + s.value, 0);
  if (slices.length === 0 || total <= 0) return null;

  return (
    <section
      className="rounded-2xl border p-4 md:p-6"
      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))' }}
      aria-labelledby="allocation-title"
    >
      <h2 id="allocation-title" className="text-lg font-semibold mb-4">
        {t('analyze.allocation.title')}
      </h2>
      <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-6">
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
                        {fmt.money(s.value)} · {fmt.share((s.value / total) * 100)}
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {t('analyze.fund.size')}
            </span>
            <span className="text-sm font-semibold tabular-nums">{fmt.compactMoney(total)}</span>
          </div>
        </div>

        <ul className="w-full space-y-2 text-sm">
          {slices.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span className="font-medium truncate">{s.label}</span>
              <span className="ml-auto tabular-nums" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {fmt.share((s.value / total) * 100)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
