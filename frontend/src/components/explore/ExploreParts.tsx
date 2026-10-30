import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { plColor, type Formatters } from '@/components/analysis/format';
import { ExperimentalBadge } from '@/components/portfolio/PortfolioFlags';
import { Sparkline } from '@/components/portfolio/Sparkline';
import type { PublicOwner, PublicPortfolioSummary } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ShareButton } from './ShareButton';
import { useDuration, useHorizon } from './useHorizon';

/** Who shared it: initials avatar and "Batuhan B.". */
export function OwnerChip({ owner, size = 'sm' }: { owner: PublicOwner; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold',
          size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'
        )}
        aria-hidden="true"
      >
        {owner.initials ?? '?'}
      </span>
      <span className={cn('truncate', size === 'sm' ? 'text-xs' : 'text-sm', 'text-muted-foreground')}>
        {owner.display_name ?? t('explore.anonymous')}
      </span>
    </span>
  );
}

/** One public portfolio on the Explore list; the whole card opens it. */
export function ExploreCard({ portfolio: p, fmt }: { portfolio: PublicPortfolioSummary; fmt: Formatters }) {
  const { t } = useTranslation();
  const horizon = useHorizon(fmt)(p.start_date, p.end_date);
  const periods = [
    ['1M', p.return_1m_pct],
    ['1Y', p.return_1y_pct],
  ] as const;

  return (
    <article className="group relative rounded-2xl border bg-card p-5 flex flex-col gap-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 focus-within:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-lg truncate">
            <Link
              to={`/explore/${p.slug}`}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
            >
              {p.name}
            </Link>
          </h2>
          <div className="flex items-center flex-wrap gap-1.5 mt-1">
            <span className="rounded-md border px-1.5 py-px text-xs font-semibold text-muted-foreground">{p.market}</span>
            {p.is_experimental && <ExperimentalBadge />}
          </div>
        </div>
        <ShareButton slug={p.slug} name={p.name} className="-mr-1.5 -mt-1" />
      </div>

      <OwnerChip owner={p.owner} />

      <Sparkline values={p.sparkline.map((v) => 1 + v / 100)} label={t('myPortfolios.sparklineLabel')} />

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{t('explore.sinceStart')}</p>
          <p className="text-2xl font-bold tabular-nums tracking-tight" style={{ color: plColor(p.return_pct ?? 0) }}>
            {p.return_pct != null ? fmt.pct(p.return_pct) : '—'}
          </p>
        </div>
        <dl className="flex gap-4 text-right">
          {periods.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">{t(`analyze.performance.ranges.${key}`)}</dt>
              <dd className="text-sm font-semibold tabular-nums" style={{ color: value != null ? plColor(value) : undefined }}>
                {value != null ? fmt.pct(value) : '—'}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {horizon && <p className="text-xs text-muted-foreground border-t pt-3 -mb-1">{horizon}</p>}
    </article>
  );
}

/**
 * A public portfolio as the landing page features it: name, owner and
 * age with the since-start return beside them, its unit price trend
 * across the card and the last month and year below. The whole card
 * opens it.
 */
export function ExploreShowcaseCard({ portfolio: p, fmt }: { portfolio: PublicPortfolioSummary; fmt: Formatters }) {
  const { t } = useTranslation();
  const duration = useDuration()(p.start_date, p.end_date);
  const periods = [
    ['1M', p.return_1m_pct],
    ['1Y', p.return_1y_pct],
  ] as const;

  return (
    <article className="group relative flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40 focus-within:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold truncate">
            <Link
              to={`/explore/${p.slug}`}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
            >
              {p.name}
            </Link>
          </h3>
          <div className="mt-1.5 flex items-center gap-2 min-w-0">
            <OwnerChip owner={p.owner} />
            {duration && <span className="shrink-0 text-xs text-muted-foreground">· {duration}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl font-bold tabular-nums tracking-tight" style={{ color: plColor(p.return_pct ?? 0) }}>
            {p.return_pct != null ? fmt.pct(p.return_pct) : '—'}
          </p>
          <p className="text-xs text-muted-foreground">{t('explore.sinceStart')}</p>
        </div>
      </div>

      <Sparkline values={p.sparkline.map((v) => 1 + v / 100)} height={64} label={t('myPortfolios.sparklineLabel')} />

      <dl className="flex items-center gap-5 border-t pt-3 text-sm">
        {periods.map(([key, value]) => (
          <div key={key} className="flex items-baseline gap-1.5">
            <dt className="text-xs text-muted-foreground">{t(`analyze.performance.ranges.${key}`)}</dt>
            <dd className="font-semibold tabular-nums" style={{ color: value != null ? plColor(value) : undefined }}>
              {value != null ? fmt.pct(value) : '—'}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
