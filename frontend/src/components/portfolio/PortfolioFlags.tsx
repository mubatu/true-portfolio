import type { InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Globe, Lock, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PortfolioSettings } from '@/services/portfolioService';

/**
 * A portfolio's visibility (private / public) and experimental flag: the
 * labels shown wherever the portfolio appears, and the fields that set
 * them in the create and settings dialogs.
 */

function Badge({ icon: Icon, label, tone }: { icon: LucideIcon; label: string; tone: 'public' | 'muted' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-px text-xs font-medium whitespace-nowrap',
        tone === 'public' ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground/75'
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function VisibilityBadge({ isPublic }: { isPublic: boolean }) {
  const { t } = useTranslation();
  return isPublic ? (
    <Badge icon={Globe} label={t('portfolioSettings.public.label')} tone="public" />
  ) : (
    <Badge icon={Lock} label={t('portfolioSettings.private.label')} tone="muted" />
  );
}

export function ExperimentalBadge() {
  const { t } = useTranslation();
  return <Badge icon={FlaskConical} label={t('portfolioSettings.experimental.label')} tone="muted" />;
}

/** Both labels of a portfolio, visibility first. */
export function PortfolioBadges({ portfolio }: { portfolio: { is_public?: boolean; is_experimental?: boolean } }) {
  return (
    <>
      <VisibilityBadge isPublic={!!portfolio.is_public} />
      {portfolio.is_experimental && <ExperimentalBadge />}
    </>
  );
}

function Choice({
  icon: Icon,
  title,
  description,
  selected,
  ...input
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'title'>) {
  return (
    <label
      className={cn(
        'flex gap-3 rounded-xl border p-3 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
      )}
    >
      <input className="sr-only" checked={selected} {...input} />
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs mt-0.5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export function PortfolioSettingsFields({
  value,
  onChange,
}: {
  value: PortfolioSettings;
  onChange: (value: PortfolioSettings) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <fieldset>
        <legend className="block text-sm font-medium mb-2">{t('portfolioSettings.visibility')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            type="radio"
            name="portfolio-visibility"
            icon={Lock}
            title={t('portfolioSettings.private.label')}
            description={t('portfolioSettings.private.description')}
            selected={!value.is_public}
            onChange={() => onChange({ ...value, is_public: false })}
          />
          <Choice
            type="radio"
            name="portfolio-visibility"
            icon={Globe}
            title={t('portfolioSettings.public.label')}
            description={t('portfolioSettings.public.description')}
            selected={value.is_public}
            onChange={() => onChange({ ...value, is_public: true })}
          />
        </div>
      </fieldset>
      <div>
        <p className="block text-sm font-medium mb-2">{t('portfolioSettings.type')}</p>
        <Choice
          type="checkbox"
          icon={FlaskConical}
          title={t('portfolioSettings.experimental.label')}
          description={t('portfolioSettings.experimental.description')}
          selected={value.is_experimental}
          onChange={(e) => onChange({ ...value, is_experimental: e.target.checked })}
        />
      </div>
    </>
  );
}
