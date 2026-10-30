import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Database, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { Modal } from '@/components/ui/Modal';
import { toDisplayTicker } from '@/config';
import { getFundPrices, uploadFundPrices } from '@/lib/api';
import { useTransactionFormatters } from './format';

const INPUT_CLASS = 'w-full px-3 py-2 rounded-md border bg-transparent';
const INPUT_STYLE = { borderColor: 'hsl(var(--input))' };

/** TEFAS names exports ``TEFASExport_..._IPB.xlsx``; the code is not inside. */
const codeFromFileName = (name: string) => /_([A-Z0-9]{3})\.xlsx$/i.exec(name)?.[1]?.toUpperCase() ?? '';

/**
 * Prices of a TEFAS fund portfolio's funds: Yahoo has none, so the user
 * uploads TEFAS's "Fon Verileri" Excel export per fund.
 */
export function FundPricesSection({ portfolioId, market }: { portfolioId: number; market: string }) {
  const { t } = useTranslation();
  const fmt = useTransactionFormatters(market);
  const [uploading, setUploading] = useState(false);

  const { data: funds = [], isLoading } = useQuery({
    queryKey: ['fund-prices', portfolioId],
    queryFn: () => getFundPrices(portfolioId),
  });

  return (
    <Panel className="mt-6 p-4 md:p-6">
      <PanelHeader
        icon={Database}
        title={t('fundPrices.title')}
        description={t('fundPrices.hint')}
        className="mb-4"
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setUploading(true)}>
            <Upload className="h-4 w-4" />
            {t('fundPrices.upload')}
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : funds.length === 0 ? (
        <div
          className="rounded-lg border-2 border-dashed p-6 text-center text-sm"
          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
        >
          {t('fundPrices.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {funds.map((fund) => (
            <div
              key={fund.ticker}
              className="rounded-lg border p-4 flex flex-wrap items-center gap-x-3 gap-y-1"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <span className="font-semibold">{toDisplayTicker(fund.ticker, market)}</span>
              <span className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {fund.first_date && fund.last_date
                  ? t('fundPrices.range', {
                      from: fmt.date(fund.first_date),
                      to: fmt.date(fund.last_date),
                      days: fund.days.toLocaleString(),
                    })
                  : t('fundPrices.missing')}
              </span>
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <FundPricesUploadModal portfolioId={portfolioId} onClose={() => setUploading(false)} />
      )}
    </Panel>
  );
}

function FundPricesUploadModal({ portfolioId, onClose }: { portfolioId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState('');

  const mutation = useMutation({
    mutationFn: () => uploadFundPrices(portfolioId, code, file!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund-prices', portfolioId] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-analysis'] });
      onClose();
    },
  });

  const isComplete = Boolean(file && /^[A-Z0-9]{3}$/.test(code));

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (isComplete && !mutation.isPending) mutation.mutate();
  };

  const errorCode = isAxiosError(mutation.error) ? mutation.error.response?.data?.detail : undefined;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('fundPrices.form.title')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => submit()} disabled={!isComplete || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('fundPrices.form.submit')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {t('fundPrices.form.hint')}
        </p>

        <div>
          <label htmlFor="fp-file" className="block text-sm font-medium mb-2">
            {t('fundPrices.form.file')}
          </label>
          <input
            id="fp-file"
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              const chosen = e.target.files?.[0] ?? null;
              setFile(chosen);
              if (chosen && !code) setCode(codeFromFileName(chosen.name));
            }}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label htmlFor="fp-code" className="block text-sm font-medium mb-2">
            {t('fundPrices.form.code')}
          </label>
          <input
            id="fp-code"
            type="text"
            maxLength={3}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="IPB"
            className={`${INPUT_CLASS} uppercase`}
            style={INPUT_STYLE}
          />
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('fundPrices.form.codeHint')}
          </p>
        </div>

        {mutation.error && (
          <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
            {typeof errorCode === 'string'
              ? t(`fundPrices.errors.${errorCode}`, { defaultValue: t('common.error') })
              : t('common.error')}
          </p>
        )}

        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
