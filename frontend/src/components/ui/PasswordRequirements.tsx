import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPasswordStrength, passwordRequirements } from '@/lib/password';

interface PasswordRequirementsProps {
  password: string;
  show?: boolean;
}

export function PasswordRequirements({ password, show = true }: PasswordRequirementsProps) {
  const { t } = useTranslation();

  if (!show) return null;

  const strength = getPasswordStrength(password);
  const strengthColor =
    strength < 40 ? 'bg-red-500' : strength < 80 ? 'bg-yellow-500' : 'bg-green-500';
  const strengthLabel =
    strength < 40
      ? t('password.strength.weak')
      : strength < 80
        ? t('password.strength.medium')
        : t('password.strength.strong');

  return (
    <div className="mt-2 space-y-3">
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('password.strength.label')}
          </span>
          <span style={{ color: 'hsl(var(--muted-foreground))' }}>{strengthLabel}</span>
        </div>
        <div
          className="h-1.5 w-full rounded-full"
          style={{ backgroundColor: 'hsl(var(--muted))' }}
        >
          <div
            className={cn('h-full rounded-full transition-all duration-300', strengthColor)}
            style={{ width: `${strength}%` }}
          />
        </div>
      </div>

      {/* Requirements List */}
      <ul className="space-y-1">
        {passwordRequirements.map((req) => {
          const passed = req.test(password);
          return (
            <li
              key={req.key}
              className={cn(
                'flex items-center gap-2 text-xs transition-colors',
                passed ? 'text-green-500' : ''
              )}
              style={!passed ? { color: 'hsl(var(--muted-foreground))' } : undefined}
            >
              {passed ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              {t(req.label)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
