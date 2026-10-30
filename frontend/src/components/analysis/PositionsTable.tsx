import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Segmented } from '@/components/ui/Segmented';
import { plColor, type Formatters } from './format';
import type { Position } from './types';

type SortKey =
  | 'ticker'
  | 'market_value'
  | 'weight_pct'
  | 'unrealized_pl'
  | 'realized_pl'
  | 'dividend_income'
  | 'total_pl'
  | 'total_pl_pct';
type Filter = 'all' | 'open' | 'closed';

const STICKY_BG = { backgroundColor: 'hsl(var(--card))' };

/**
 * Per-stock P/L: what is still open (unrealized) and what was already
 * locked in by selling (realized), plus dividends, for every stock ever held.
 */
export function PositionsTable({
  positions,
  fmt,
  displayTicker,
}: {
  positions: Position[];
  fmt: Formatters;
  displayTicker: (ticker: string) => string;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean } | null>(null);

  const visible = useMemo(() => {
    const filtered = positions.filter((p) =>
      filter === 'all' ? true : filter === 'open' ? p.quantity > 0 : p.quantity <= 0
    );
    if (!sort) return filtered; // server order: open by size, then closed
    const dir = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) =>
      sort.key === 'ticker' ? dir * a.ticker.localeCompare(b.ticker) : dir * (a[sort.key] - b[sort.key])
    );
  }, [positions, filter, sort]);

  const totals = useMemo(
    () =>
      visible.reduce(
        (acc, p) => ({
          market_value: acc.market_value + p.market_value,
          unrealized_pl: acc.unrealized_pl + p.unrealized_pl,
          realized_pl: acc.realized_pl + p.realized_pl,
          dividend_income: acc.dividend_income + p.dividend_income,
          total_pl: acc.total_pl + p.total_pl,
          invested: acc.invested + p.invested,
        }),
        { market_value: 0, unrealized_pl: 0, realized_pl: 0, dividend_income: 0, total_pl: 0, invested: 0 }
      ),
    [visible]
  );

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? (s.desc ? { key, desc: false } : null) : { key, desc: key !== 'ticker' }));

  const openCount = positions.filter((p) => p.quantity > 0).length;

  return (
    <section className="mb-6" aria-labelledby="positions-title">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
        <div>
          <h2 id="positions-title" className="text-lg font-semibold">
            {t('analyze.positions.title')}
          </h2>
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('analyze.positions.hint')}
          </p>
        </div>
        <Segmented
          size="sm"
          label={t('analyze.positions.filterLabel')}
          options={[
            { key: 'all', label: t('analyze.positions.filters.all', { count: positions.length }) },
            { key: 'open', label: t('analyze.positions.filters.open', { count: openCount }) },
            { key: 'closed', label: t('analyze.positions.filters.closed', { count: positions.length - openCount }) },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {visible.length === 0 ? (
        <div
          className="rounded-xl border-2 border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
        >
          {t('analyze.positions.empty')}
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'hsl(var(--border))', ...STICKY_BG }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 px-3 py-3 text-left text-xs font-medium" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('ticker')}
                      className="inline-flex items-center gap-1"
                      style={{ color: sort?.key === 'ticker' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                    >
                      {t('analyze.table.ticker')}
                      {sort?.key === 'ticker' && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </button>
                  </th>
                  <th scope="col" className="px-3 py-3 text-right text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {t('analyze.table.qty')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right text-xs font-medium whitespace-nowrap" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {t('analyze.table.avgCost')} / {t('analyze.table.price')}
                  </th>
                  <SortHeader sort={sort} onSort={toggleSort} k="market_value" label={t('analyze.table.value')} />
                  <SortHeader sort={sort} onSort={toggleSort} k="weight_pct" label={t('analyze.positions.weight')} />
                  <SortHeader sort={sort} onSort={toggleSort} k="unrealized_pl" label={t('analyze.table.unrealized')} />
                  <SortHeader sort={sort} onSort={toggleSort} k="realized_pl" label={t('analyze.table.realized')} />
                  <SortHeader sort={sort} onSort={toggleSort} k="dividend_income" label={t('analyze.positions.dividends')} />
                  <SortHeader sort={sort} onSort={toggleSort} k="total_pl" label={t('analyze.table.total')} />
                  <SortHeader sort={sort} onSort={toggleSort} k="total_pl_pct" label={t('analyze.positions.totalPct')} />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const open = p.quantity > 0;
                  return (
                    <tr key={p.ticker} className="border-t group" style={{ borderColor: 'hsl(var(--border))' }}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 px-3 py-3 text-left font-semibold whitespace-nowrap group-hover:bg-muted/50"
                        style={STICKY_BG}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: open ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.5)' }}
                            aria-hidden="true"
                          />
                          {displayTicker(p.ticker)}
                          {!open && (
                            <span
                              className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                            >
                              {t('analyze.positions.closed')}
                            </span>
                          )}
                        </span>
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums">{open ? fmt.number(p.quantity) : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                        {open ? (
                          <>
                            <span style={{ color: 'hsl(var(--muted-foreground))' }}>{fmt.money(p.avg_cost)}</span>
                            <span className="mx-1" style={{ color: 'hsl(var(--muted-foreground))' }}>→</span>
                            {p.price != null ? fmt.money(p.price) : '—'}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{open ? fmt.money(p.market_value) : '—'}</td>
                      <td className="px-3 py-3 text-right">
                        {open ? <WeightBar pct={p.weight_pct} label={fmt.share(p.weight_pct)} /> : '—'}
                      </td>
                      <PlCell value={p.unrealized_pl} fmt={fmt} muted={!open} />
                      <PlCell value={p.realized_pl} fmt={fmt} />
                      <PlCell value={p.dividend_income} fmt={fmt} />
                      <PlCell value={p.total_pl} fmt={fmt} strong />
                      <td className="px-3 py-3 text-right tabular-nums font-semibold" style={{ color: plColor(p.total_pl_pct) }}>
                        {fmt.pct(p.total_pl_pct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold" style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted) / 0.3)' }}>
                  <th scope="row" className="sticky left-0 z-10 px-3 py-3 text-left" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                    {t('analyze.table.sum')}
                  </th>
                  <td />
                  <td />
                  <td className="px-3 py-3 text-right tabular-nums">{fmt.money(totals.market_value)}</td>
                  <td />
                  <PlCell value={totals.unrealized_pl} fmt={fmt} />
                  <PlCell value={totals.realized_pl} fmt={fmt} />
                  <PlCell value={totals.dividend_income} fmt={fmt} />
                  <PlCell value={totals.total_pl} fmt={fmt} strong />
                  <td className="px-3 py-3 text-right tabular-nums" style={{ color: plColor(totals.total_pl) }}>
                    {totals.invested > 0 ? fmt.pct((totals.total_pl / totals.invested) * 100) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function SortHeader({
  k,
  label,
  sort,
  onSort,
}: {
  k: SortKey;
  label: string;
  sort: { key: SortKey; desc: boolean } | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === k;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
      className="px-3 py-3 text-xs font-medium whitespace-nowrap text-right"
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 focus-visible:outline-none focus-visible:underline"
        style={{ color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
      >
        {label}
        {active && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );
}

function PlCell({ value, fmt, strong, muted }: { value: number; fmt: Formatters; strong?: boolean; muted?: boolean }) {
  const zero = Math.abs(value) < 0.005;
  return (
    <td
      className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${strong ? 'font-semibold' : ''}`}
      style={{ color: zero || muted ? 'hsl(var(--muted-foreground))' : plColor(value) }}
    >
      {zero ? '—' : fmt.signedMoney(value)}
    </td>
  );
}

function WeightBar({ pct, label }: { pct: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <span className="h-1.5 w-16 rounded-full overflow-hidden" style={{ backgroundColor: 'hsl(var(--muted))' }} aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: 'hsl(var(--primary))' }} />
      </span>
      <span className="tabular-nums w-14 text-right">{label}</span>
    </span>
  );
}
