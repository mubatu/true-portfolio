import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { toDisplayTicker } from '@/config';
import { todayIso } from '@/lib/dates';
import type { RightsIssue, RightsIssueInput } from '@/lib/api';

const INPUT_CLASS = 'w-full px-3 py-2 rounded-md border bg-transparent';
const INPUT_STYLE = { borderColor: 'hsl(var(--input))' };

/** Enter or correct a rights issue from its KAP announcement. */
export function RightsIssueFormModal({
  tickers,
  market,
  initial,
  isPending,
  error,
  onClose,
  onSubmit,
}: {
  /** The portfolio's tickers, full form (e.g. KONTR.IS). */
  tickers: string[];
  market: string;
  initial?: RightsIssue;
  isPending: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: RightsIssueInput) => void;
}) {
  const { t } = useTranslation();
  const [ticker, setTicker] = useState(initial?.ticker ?? tickers[0] ?? '');
  const [exDate, setExDate] = useState(initial?.ex_date ?? '');
  const [ratioPct, setRatioPct] = useState(
    initial?.ratio != null ? String(Math.round(initial.ratio * 10000) / 100) : ''
  );
  const [price, setPrice] = useState(
    initial?.subscription_price != null ? String(initial.subscription_price) : '1'
  );

  const isComplete = Boolean(ticker && exDate && Number(ratioPct) > 0 && price !== '');

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!isComplete || isPending) return;
    onSubmit({
      ticker,
      ex_date: exDate,
      ratio: Number(ratioPct) / 100,
      subscription_price: Number(price),
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t(initial ? 'rightsIssues.form.editTitle' : 'rightsIssues.form.title')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => handleSubmit()} disabled={!isComplete || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {t('rightsIssues.form.hint')}
        </p>

        <Field id="ri-ticker" label={t('rightsIssues.form.ticker')}>
          <select
            id="ri-ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            disabled={!!initial}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          >
            {tickers.map((full) => (
              <option key={full} value={full}>
                {toDisplayTicker(full, market)}
              </option>
            ))}
          </select>
        </Field>

        <Field id="ri-date" label={t('rightsIssues.form.exDate')}>
          <input
            id="ri-date"
            type="date"
            value={exDate}
            max={todayIso()}
            onChange={(e) => setExDate(e.target.value)}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field id="ri-ratio" label={t('rightsIssues.form.ratio')}>
            <input
              id="ri-ratio"
              type="number"
              step="any"
              min="0"
              value={ratioPct}
              onChange={(e) => setRatioPct(e.target.value)}
              placeholder="100"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field id="ri-price" label={t('rightsIssues.form.price')}>
            <input
              id="ri-price"
              type="number"
              step="any"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
        </div>

        {error && (
          <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
            {error}
          </p>
        )}

        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}
