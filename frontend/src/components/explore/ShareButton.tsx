import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The public page of a portfolio, the link people pass around. */
const publicUrl = (slug: string) => `${window.location.origin}/explore/${slug}`;

/** Copies text; where the Clipboard API is refused, the older selection copy. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('copy refused');
  }
}

/**
 * Shares a public portfolio's Explore link: the system share sheet where
 * there is one (phones), else the link is copied and the button says so.
 * ``ghost`` and ``outline`` are icon buttons (cards, headers next to other
 * icon buttons); ``labelled`` spells out "Share", ``labelled-ghost`` too
 * but quietly, its word hidden on phones like its neighbors'.
 */
export function ShareButton({
  slug,
  name,
  variant = 'ghost',
  className,
}: {
  slug: string;
  name: string;
  variant?: 'ghost' | 'outline' | 'labelled' | 'labelled-ghost';
  className?: string;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const id = window.setTimeout(() => setStatus('idle'), 2000);
    return () => window.clearTimeout(id);
  }, [status]);

  const share = async () => {
    const url = publicUrl(slug);
    if (navigator.share) {
      try {
        await navigator.share({ title: name, text: t('explore.share.text', { name }), url });
        return;
      } catch (e) {
        // Closing the sheet is not a failure; anything else falls back to copying.
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await copyText(url);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  const label =
    status === 'copied' ? t('explore.share.copied') : status === 'failed' ? t('explore.share.failed') : t('explore.share.label');
  const Icon = status === 'copied' ? Check : Share2;
  const iconClass = cn('h-4 w-4', status === 'copied' ? 'text-gain' : variant === 'ghost' && 'text-muted-foreground');
  const live = (
    <span className="sr-only" aria-live="polite">
      {status !== 'idle' ? label : ''}
    </span>
  );

  if (variant === 'labelled' || variant === 'labelled-ghost') {
    const quiet = variant === 'labelled-ghost';
    return (
      <Button
        variant={quiet ? 'ghost' : 'outline'}
        className={cn('gap-1.5', className)}
        onClick={share}
        aria-label={t('explore.share.label')}
      >
        <Icon className={iconClass} />
        <span className={quiet && status === 'idle' ? 'hidden sm:inline' : undefined}>
          {status === 'idle' ? t('explore.share.short') : label}
        </span>
        {live}
      </Button>
    );
  }

  // Above a card's stretched link, so the click shares instead of opening it.
  return (
    <span className={cn('relative z-10 inline-flex items-center gap-1.5 shrink-0', className)}>
      {status !== 'idle' && (
        <span
          className={cn('text-xs font-medium', status === 'copied' ? 'text-gain' : 'text-destructive')}
          aria-hidden="true"
        >
          {label}
        </span>
      )}
      <Button
        variant={variant}
        size="icon"
        className={variant === 'ghost' ? 'h-8 w-8' : undefined}
        onClick={share}
        aria-label={t('explore.share.label')}
        title={t('explore.share.label')}
      >
        <Icon className={iconClass} />
      </Button>
      {live}
    </span>
  );
}
