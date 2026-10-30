import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useNavItems } from './navItems';

/**
 * Phones, signed in: the main sections as a tab bar fixed to the bottom of
 * the screen (the header shows them from md up; the profile is in the
 * avatar menu). Renders a spacer of the same height so the end of the page
 * is not hidden behind it.
 */
export function BottomNav() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navItems = useNavItems();

  if (!isAuthenticated) return null;

  return (
    <>
      <div className="md:hidden h-[calc(4rem+env(safe-area-inset-bottom))]" aria-hidden="true" />
      <nav
        aria-label={t('common.mainNav')}
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-card/90 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid h-16" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
          {navItems.map(({ to, label, icon: Icon, active }) => (
            <li key={to}>
              <Link
                to={to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                    active && 'bg-primary/10'
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="max-w-full truncate px-1">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
