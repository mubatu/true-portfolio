import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Briefcase, Compass, LayoutDashboard, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}

/** The main sections, shared by the header (wide screens) and the bottom bar (phones). */
export function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  // Portfolio pages live under "My Portfolios". The dev preview mounts the
  // same pages under /dev.
  const path = location.pathname.replace(/^\/dev(?=\/)/, '');
  // Explore is open to everyone; the rest needs an account.
  const explore = { to: '/explore', label: t('explore.title'), icon: Compass, active: path.startsWith('/explore') };
  return isAuthenticated
    ? [
        explore,
        { to: '/overview', label: t('overview.title'), icon: LayoutDashboard, active: path === '/overview' },
        {
          to: '/my-portfolios',
          label: t('common.myPortfolios'),
          icon: Briefcase,
          active: path === '/my-portfolios' || path.startsWith('/portfolio/'),
        },
      ]
    : [explore];
}
