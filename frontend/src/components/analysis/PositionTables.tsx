import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { plBg, plColor, type Formatters } from './format';
import type { ClosedPosition, CurrentHolding, DividendSummary } from './types';

interface TableProps {
  fmt: Formatters;
  displayTicker: (ticker: string) => string;
}

export function HoldingsTable({ holdings, fmt, displayTicker }: TableProps & { holdings: CurrentHolding[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t('analyze.currentHoldings')}>
      {holdings.length === 0 ? (
        <Empty text={t('analyze.noCurrentHoldings')} />
      ) : (
        <Table
          head={[
            [t('analyze.table.ticker'), 'left'],
            [t('analyze.table.qty')],
            [t('analyze.table.avgCost')],
            [t('analyze.table.price')],
            [t('analyze.table.value')],
            [t('analyze.table.unrealized')],
            [t('analyze.table.pct')],
          ]}
        >
          {holdings.map((h) => (
            <Row key={h.ticker}>
              <td className="px-4 py-3 font-semibold">{displayTicker(h.ticker)}</td>
              <Num>{fmt.number(h.quantity)}</Num>
              <Num>{fmt.money(h.avg_cost)}</Num>
              <Num>{h.current_price != null ? fmt.money(h.current_price) : '—'}</Num>
              <Num>{fmt.money(h.current_value)}</Num>
              <Num color={plColor(h.unrealized_pl)}>{fmt.money(h.unrealized_pl)}</Num>
              <Num>
                <PctPill value={h.unrealized_pl_pct} fmt={fmt} />
              </Num>
            </Row>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function ClosedPositionsTable({
  positions,
  fmt,
  displayTicker,
}: TableProps & { positions: ClosedPosition[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t('analyze.closedPositions')}>
      {positions.length === 0 ? (
        <Empty text={t('analyze.noClosedPositions')} />
      ) : (
        <Table
          head={[
            [t('analyze.table.ticker'), 'left'],
            [t('analyze.table.invested')],
            [t('analyze.table.returned')],
            [t('analyze.table.realized')],
            [t('analyze.table.pct')],
          ]}
        >
          {positions.map((c) => (
            <Row key={c.ticker}>
              <td className="px-4 py-3 font-semibold">{displayTicker(c.ticker)}</td>
              <Num>{fmt.money(c.total_invested)}</Num>
              <Num>{fmt.money(c.total_returned)}</Num>
              <Num color={plColor(c.realized_pl)}>{fmt.money(c.realized_pl)}</Num>
              <Num>
                <PctPill value={c.realized_pl_pct} fmt={fmt} />
              </Num>
            </Row>
          ))}
        </Table>
      )}
    </Section>
  );
}

export function DividendsTable({
  dividends,
  fmt,
  displayTicker,
}: TableProps & { dividends: DividendSummary }) {
  const { t } = useTranslation();
  return (
    <Section title={t('analyze.dividends')} hint={t('analyze.dividendsHint')}>
      {dividends.receipts.length === 0 ? (
        <Empty text={t('analyze.noDividends')} />
      ) : (
        <Table
          head={[
            [t('analyze.table.exDate'), 'left'],
            [t('analyze.table.ticker'), 'left'],
            [t('analyze.table.shares')],
            [t('analyze.table.grossPerShare')],
            [t('analyze.table.gross')],
            [t('analyze.table.withholding')],
            [t('analyze.table.net')],
          ]}
          foot={
            <tr
              className="border-t font-semibold"
              style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--muted) / 0.3)' }}
            >
              <td className="px-4 py-3" colSpan={4}>
                {t('analyze.table.sum')}
              </td>
              <Num>{fmt.money(dividends.total_gross)}</Num>
              <td />
              <Num color={plColor(dividends.total_net)}>{fmt.money(dividends.total_net)}</Num>
            </tr>
          }
        >
          {dividends.receipts.map((d) => (
            <Row key={`${d.ticker}-${d.ex_date}`}>
              <td className="px-4 py-3 whitespace-nowrap">{fmt.date(d.ex_date)}</td>
              <td className="px-4 py-3 font-semibold">{displayTicker(d.ticker)}</td>
              <Num>{fmt.number(d.quantity)}</Num>
              <Num>{fmt.money(d.gross_per_share)}</Num>
              <Num>{fmt.money(d.gross_amount)}</Num>
              <Num color="hsl(var(--muted-foreground))">{fmt.rate(d.withholding_rate)}</Num>
              <Num color={plColor(d.net_amount)}>{fmt.money(d.net_amount)}</Num>
            </Row>
          ))}
        </Table>
      )}
    </Section>
  );
}

// ── Building blocks ──────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className={`text-xl font-semibold ${hint ? 'mb-1' : 'mb-4'}`}>{title}</h2>
      {hint && (
        <p className="text-sm mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {hint}
        </p>
      )}
      {children}
    </section>
  );
}

function Table({
  head,
  foot,
  children,
}: {
  head: [string, 'left'?][];
  foot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}>
              {head.map(([label, align], i) => (
                <th
                  key={i}
                  className={`${align === 'left' ? 'text-left' : 'text-right'} px-4 py-3 text-sm font-medium`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
          {foot && <tfoot>{foot}</tfoot>}
        </table>
      </div>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <tr className="border-t transition-colors hover:bg-muted/50" style={{ borderColor: 'hsl(var(--border))' }}>
      {children}
    </tr>
  );
}

function Num({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <td className={`text-right px-4 py-3${color ? ' font-medium' : ''}`} style={{ color }}>
      {children}
    </td>
  );
}

function PctPill({ value, fmt }: { value: number; fmt: Formatters }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-medium"
      style={{ backgroundColor: plBg(value), color: plColor(value) }}
    >
      {value >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {fmt.pct(value)}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed p-8 text-center" style={{ borderColor: 'hsl(var(--border))' }}>
      <p style={{ color: 'hsl(var(--muted-foreground))' }}>{text}</p>
    </div>
  );
}
