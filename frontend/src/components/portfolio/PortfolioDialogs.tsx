import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { MARKETS, type Market } from '@/config';
import {
  createPortfolio,
  deletePortfolio,
  updatePortfolio,
  type Portfolio,
  type PortfolioSettings,
} from '@/services/portfolioService';
import { PortfolioSettingsFields } from './PortfolioFlags';

const INPUT_CLASS = 'w-full px-3 py-2 rounded-md border bg-transparent';
const INPUT_STYLE = { borderColor: 'hsl(var(--input))' };

// Each dialog owns its form state and mutation; the page mounts one only
// while it is open, so fields always start fresh.

/** New portfolio; on success opens it to add the first trade. */
export function CreatePortfolioDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [market, setMarket] = useState<Market>('BIST');
  const [settings, setSettings] = useState<PortfolioSettings>({ is_public: false, is_experimental: false });

  const mutation = useMutation({
    mutationFn: createPortfolio,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      onClose();
      navigate(`/portfolio/${created.slug}`);
    },
  });

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (name.trim() && !mutation.isPending) mutation.mutate({ name: name.trim(), market, ...settings });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('myPortfolios.create.title')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => submit()} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="portfolio-name" className="block text-sm font-medium mb-2">
            {t('myPortfolios.create.nameLabel')}
          </label>
          <input
            id="portfolio-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('myPortfolios.create.namePlaceholder')}
            autoFocus
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </div>
        <div>
          <label htmlFor="portfolio-market" className="block text-sm font-medium mb-2">
            {t('myPortfolios.create.marketLabel')}
          </label>
          <select
            id="portfolio-market"
            value={market}
            onChange={(e) => setMarket(e.target.value as Market)}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          >
            {MARKETS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <PortfolioSettingsFields value={settings} onChange={setSettings} />
        {mutation.error && (
          <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
            {mutation.error.message}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/**
 * Name, visibility and experimental flag of an existing portfolio, and
 * deleting it (behind a confirmation; "Cancel" there comes back here).
 * ``onDeleted`` runs after a delete, e.g. to leave the deleted portfolio's page.
 */
export function PortfolioSettingsDialog({
  portfolio,
  onClose,
  onDeleted,
}: {
  portfolio: Portfolio;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [name, setName] = useState(portfolio.name);
  const [settings, setSettings] = useState<PortfolioSettings>({
    is_public: !!portfolio.is_public,
    is_experimental: !!portfolio.is_experimental,
  });

  const mutation = useMutation({
    mutationFn: updatePortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', portfolio.slug] });
      queryClient.invalidateQueries({ queryKey: ['explore'] });
      onClose();
    },
  });

  if (confirmingDelete) {
    return (
      <DeletePortfolioDialog
        portfolio={portfolio}
        onCancel={() => setConfirmingDelete(false)}
        onDeleted={() => {
          onClose();
          onDeleted?.();
        }}
      />
    );
  }

  const unchanged =
    name.trim() === portfolio.name &&
    settings.is_public === !!portfolio.is_public &&
    settings.is_experimental === !!portfolio.is_experimental;
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (name.trim() && !unchanged && !mutation.isPending) {
      mutation.mutate({ id: portfolio.id, name: name.trim(), ...settings });
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('portfolioSettings.title')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => submit()} disabled={!name.trim() || unchanged || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="portfolio-rename" className="block text-sm font-medium mb-2">
            {t('myPortfolios.edit.nameLabel')}
          </label>
          <input
            id="portfolio-rename"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('myPortfolios.edit.namePlaceholder')}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </div>
        <PortfolioSettingsFields value={settings} onChange={setSettings} />
        {mutation.error && (
          <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
            {mutation.error.message}
          </p>
        )}
        <button type="submit" hidden />
      </form>

      <div className="mt-6 border-t pt-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t('portfolioSettings.delete.title')}</p>
          <p className="text-xs mt-0.5 text-muted-foreground">{t('portfolioSettings.delete.description')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('common.delete')}
        </Button>
      </div>
    </Modal>
  );
}

/** Asks before deleting a portfolio; reached from its settings. */
function DeletePortfolioDialog({
  portfolio,
  onCancel,
  onDeleted,
}: {
  portfolio: Portfolio;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deletePortfolio,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['explore'] });
      queryClient.removeQueries({ queryKey: ['portfolio-analysis', portfolio.id] });
      queryClient.removeQueries({ queryKey: ['portfolio', portfolio.slug] });
      onDeleted();
    },
  });

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={t('portfolio.deleteConfirm.title')}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={() => mutation.mutate(portfolio.id)} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('portfolio.deleteConfirm.confirm')}
          </Button>
        </>
      }
    >
      <p style={{ color: 'hsl(var(--muted-foreground))' }}>
        {t('portfolio.deleteConfirm.message', { name: portfolio.name })}
      </p>
      {mutation.error && (
        <p className="text-sm mt-3" style={{ color: 'hsl(var(--destructive))' }}>
          {mutation.error.message}
        </p>
      )}
    </Modal>
  );
}
