import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Moon, Sun, LogOut, LayoutDashboard, User, ChevronDown, Briefcase, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const isActive = (path: string) => location.pathname === path;

  const getUserInitials = () => {
    const name = user?.user_metadata?.full_name;
    if (name) {
      return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user?.email?.charAt(0).toUpperCase() || 'U';
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        {/* Logo */}
        <Link 
          to="/" 
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <span className="text-xl font-semibold hidden sm:inline">{t('common.appName')}</span>
        </Link>

        {/* Navigation for authenticated users */}
        {isAuthenticated && (
          <nav className="hidden md:flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
            <Link to="/dashboard">
              <Button 
                variant="ghost" 
                size="default"
                className={`gap-2 text-base ${
                  isActive('/dashboard') 
                    ? 'font-medium' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                style={isActive('/dashboard') ? { color: 'hsl(var(--primary))' } : undefined}
              >
                <LayoutDashboard className="h-5 w-5" />
                {t('common.dashboard')}
              </Button>
            </Link>
            <Link to="/my-portfolios">
              <Button 
                variant="ghost" 
                size="default"
                className={`gap-2 text-base ${
                  isActive('/my-portfolios') 
                    ? 'font-medium' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                style={isActive('/my-portfolios') ? { color: 'hsl(var(--primary))' } : undefined}
              >
                <Briefcase className="h-5 w-5" />
                {t('common.myPortfolios')}
              </Button>
            </Link>
          </nav>
        )}
        
        {/* Right side actions */}
        <div className="flex items-center gap-3">
          {/* Language toggle (TR ⇄ EN) */}
          <Button
            variant="ghost"
            size="default"
            className="h-11 gap-1.5 px-3"
            onClick={() => i18n.changeLanguage(nextLanguage.code)}
            aria-label={`${t('common.language')}: ${nextLanguage.label}`}
            title={nextLanguage.label}
          >
            <Languages className="h-5 w-5" />
            <span className="text-sm font-medium uppercase">{currentLanguage}</span>
          </Button>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={toggleTheme}
            aria-label={t('common.toggleTheme')}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          {isAuthenticated ? (
            /* User dropdown */
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground text-base font-medium">
                  {getUserInitials()}
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform hidden sm:block ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
                  {/* User info */}
                  <div className="px-3 py-2 border-b">
                    <p className="text-sm font-medium truncate">
                      {user?.user_metadata?.full_name || 'User'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.email}
                    </p>
                  </div>

                  {/* Mobile nav items */}
                  <div className="md:hidden py-1 border-b">
                    <Link 
                      to="/dashboard" 
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      {t('common.dashboard')}
                    </Link>
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
          ) : (
            <Link to="/auth">
              <Button size="default" className="text-base px-6">{t('common.signIn')}</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
