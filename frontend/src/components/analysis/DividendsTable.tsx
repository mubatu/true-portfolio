import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { plColor, type Formatters } from './format';
import type { DividendSummary } from './types';

interface TableProps {
  fmt: Formatters;
  displayTicker: (ticker: string) => string;
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

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed p-8 text-center" style={{ borderColor: 'hsl(var(--border))' }}>
      <p style={{ color: 'hsl(var(--muted-foreground))' }}>{text}</p>
    </div>
  );
}
