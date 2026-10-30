import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Labeled input with a leading icon; password fields get a show/hide toggle. */
export const TextField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; icon?: LucideIcon; hint?: string }
>(function TextField({ label, icon: Icon, hint, id, type = 'text', className, ...props }, ref) {
  const { t } = useTranslation();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <input
          ref={ref}
          id={id}
          type={isPassword && reveal ? 'text' : type}
          className={cn(
            'h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm transition-colors',
            'placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15',
            'disabled:opacity-60',
            Icon && 'pl-10',
            isPassword && 'pr-11',
            className
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label={t(reveal ? 'auth.hidePassword' : 'auth.showPassword')}
            aria-pressed={reveal}
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
});
