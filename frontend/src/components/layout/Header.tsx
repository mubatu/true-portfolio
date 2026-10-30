import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, LogOut, User, ChevronDown, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from './Logo';
import { useNavItems } from './navItems';
import { LOCALES } from '@/config';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect } from 'react';

export function Header() {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage ?? 'tr';
  const nextLanguage =
    LOCALES[(LOCALES.findIndex((l) => l.code === currentLanguage) + 1) % LOCALES.length];
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    navigate('/');
    await signOut();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = useNavItems();

  const getUserInitials = () => {
    const name = user?.user_metadata?.full_name;
    if (name) {
      return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user?.email?.charAt(0).toUpperCase() || 'U';
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 max-w-7xl">
        {/* Logo */}
        <Link
          to={isAuthenticated ? '/explore' : '/'}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <Logo nameClassName="hidden sm:inline" />
        </Link>

        {/* Navigation (signed out: Explore only) */}
        {(isAuthenticated || location.pathname !== '/auth') && (
          <nav
            // Signed out there is one item (Explore): on phones it sits in the
            // row between the logo and the buttons instead of centered over them.
            // Signed in, phones get the bottom bar (BottomNav) instead.
            className={`${isAuthenticated ? 'hidden' : 'flex'} md:flex items-center gap-2 md:absolute md:left-1/2 md:-translate-x-1/2`}
          >
            {navItems.map(({ to, label, icon: Icon, active }) => (
              <Link key={to} to={to}>
                <Button
                  variant="ghost"
                  size="default"
                  className={`gap-2 rounded-full px-4 ${
                    active ? 'bg-primary/10 font-semibold' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  style={active ? { color: 'hsl(var(--primary))' } : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              </Link>
            ))}
          </nav>
        )}
        
        {/* Right side actions */}
        <div className="flex items-center gap-1.5">
          {/* Language toggle (TR ⇄ EN) */}
          <Button
            variant="ghost"
            size="default"
            className="h-9 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground"
            onClick={() => i18n.changeLanguage(nextLanguage.code)}
            aria-label={`${t('common.language')}: ${nextLanguage.label}`}
            title={nextLanguage.label}
          >
            <Languages className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">{currentLanguage}</span>
          </Button>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            onClick={toggleTheme}
            aria-label={t('common.toggleTheme')}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {isAuthenticated ? (
            /* User dropdown */
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1 p-1 ml-1 rounded-full hover:bg-accent transition-colors"
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary text-sm font-semibold">
                  {getUserInitials()}
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform hidden sm:block ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl border bg-popover shadow-xl py-1 animate-in fade-in-0 zoom-in-95" role="menu">
                  {/* User info */}
                  <div className="px-3 py-2 border-b">
                    {user?.user_metadata?.full_name && (
                      <p className="text-sm font-medium truncate">
                        {user.user_metadata.full_name}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.email}
                    </p>
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    <Link 
                      to="/profile" 
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <User className="h-4 w-4" />
                      {t('profile.title')}
                    </Link>
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        handleSignOut();
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors w-full text-left text-destructive"
                    >
                      <LogOut className="h-4 w-4" />
                      {t('common.signOut')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : location.pathname === '/auth' ? null : (
            <Link to="/auth">
              <Button size="default" className="px-5 ml-1 rounded-full">{t('common.signIn')}</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
