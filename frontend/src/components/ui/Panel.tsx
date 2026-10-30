import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The card every page section sits on: white (dark: raised) surface, soft border and shadow. */
export function Panel({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('rounded-2xl border bg-card text-card-foreground shadow-sm', className)} {...props}>
      {children}
    </section>
  );
}

/**
 * Section title with a tinted icon, an optional one-line explanation and actions on the right.
 *
 * Phones leave the explanation out (the title then centers on the icon),
 * unless ``keepDescription`` (for a description that is data, e.g. a count).
 */
export function PanelHeader({
  icon: Icon,
  title,
  description,
  actions,
  id,
  className,
  keepDescription = false,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Heading id, for ``aria-labelledby`` on the panel. */
  id?: string;
  className?: string;
  keepDescription?: boolean;
}) {
  // A title alone is centered on the icon; with a description the two
  // lines start at the icon's top.
  const top = description ? (keepDescription ? 'always' : 'sm') : null;
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3', className)}>
      <div
        className={cn(
          'flex gap-3 min-w-0',
          top === 'always' ? 'items-start' : top === 'sm' ? 'items-center sm:items-start' : 'items-center'
        )}
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary',
            top === 'always' && 'mt-0.5',
            top === 'sm' && 'sm:mt-0.5'
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold leading-tight tracking-tight">
            {title}
          </h2>
          {description && (
            <p className={cn('text-sm mt-1 text-muted-foreground', !keepDescription && 'hidden sm:block')}>{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/** An explanatory note under a chart or a page: from sm up only, phones leave it out. */
export function InfoNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('hidden sm:block text-xs text-muted-foreground', className)}>{children}</p>;
}
