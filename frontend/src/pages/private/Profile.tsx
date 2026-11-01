import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarDays,
  Languages,
  LogOut,
  Mail,
  Moon,
  ReceiptText,
  SlidersHorizontal,
  Sun,
  User,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/Panel';
import { Segmented } from '@/components/ui/Segmented';
import { TextField } from '@/components/ui/TextField';
import { LOCALES } from '@/config';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTheme } from '@/hooks/useTheme';
import { getPortfolios } from '@/services/portfolioService';

/** Account overview, name and email from Google, language and theme, sign out. */
export function Profile() {
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  useDocumentTitle(t('profile.title'));

  const { data: portfolios = [] } = useQuery({ queryKey: ['portfolios'], queryFn: getPortfolios });
  const transactions = portfolios.reduce((sum, p) => sum + (p.transaction_count ?? 0), 0);

  const fullName: string = user?.user_metadata?.full_name ?? '';
  const initials =
    fullName
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || (user?.email?.charAt(0).toUpperCase() ?? '?');
  const memberSince = user?.created_at
    ? new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(new Date(user.created_at))
    : null;

  const handleSignOut = async () => {
    navigate('/');
    await signOut();
  };

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t('profile.title')}</h1>
        <p className="hidden sm:block text-sm mt-1 text-muted-foreground">{t('profile.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
        {/* Identity */}
        <Panel className="overflow-hidden lg:sticky lg:top-24">
          <div className="h-20 bg-gradient-to-br from-[hsl(var(--logo-from))] to-[hsl(var(--logo-to))]" aria-hidden="true" />
          <div className="px-6 pb-6 -mt-10">
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-card bg-primary-fill text-2xl font-bold text-primary-foreground shadow-md">
              {initials}
            </span>
            <h2 className="mt-3 text-lg font-semibold truncate">{fullName || t('profile.noName')}</h2>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            {memberSince && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {t('profile.memberSince', { date: memberSince })}
              </p>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-3">
              <Stat icon={Briefcase} label={t('profile.stats.portfolios')} value={portfolios.length} />
              <Stat icon={ReceiptText} label={t('profile.stats.transactions')} value={transactions} />
            </dl>
          </div>
        </Panel>

        <div className="space-y-6 min-w-0">
          <AccountInfo name={fullName} email={user?.email ?? ''} />
          <Preferences />

          <Panel className="p-4 md:p-6">
            <PanelHeader
              icon={LogOut}
              title={t('profile.session.title')}
              description={t('profile.session.description')}
              actions={
                <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                  {t('common.signOut')}
                </Button>
              }
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Briefcase; label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-background/50 p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

/** Name and email come from the Google account; Google sends them again on every sign-in. */
function AccountInfo({ name, email }: { name: string; email: string }) {
  const { t } = useTranslation();
  return (
    <Panel className="p-4 md:p-6">
      <PanelHeader icon={UserRound} title={t('profile.account.title')} description={t('profile.account.description')} className="mb-5" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="profile-name" label={t('profile.account.name')} icon={User} value={name} disabled readOnly />
        <TextField id="profile-email" label={t('profile.account.email')} icon={Mail} value={email} disabled readOnly />
      </div>
    </Panel>
  );
}

function Preferences() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const language = (i18n.resolvedLanguage ?? 'tr') as string;

  return (
    <Panel className="p-4 md:p-6">
      <PanelHeader icon={SlidersHorizontal} title={t('profile.preferences.title')} description={t('profile.preferences.description')} className="mb-5" />
      <div className="divide-y">
        <PreferenceRow icon={Languages} label={t('common.language')} hint={t('profile.preferences.languageHint')}>
          <Segmented
            label={t('common.language')}
            options={LOCALES.map((l) => ({ key: l.code, label: l.label }))}
            value={language}
            onChange={(code) => i18n.changeLanguage(code)}
          />
        </PreferenceRow>
        <PreferenceRow icon={theme === 'dark' ? Moon : Sun} label={t('profile.preferences.theme')} hint={t('profile.preferences.themeHint')}>
          <Segmented
            label={t('profile.preferences.theme')}
            options={[
              { key: 'light', label: t('profile.preferences.light') },
              { key: 'dark', label: t('profile.preferences.dark') },
            ]}
            value={theme}
            onChange={setTheme}
          />
        </PreferenceRow>
      </div>
    </Panel>
  );
}

function PreferenceRow({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: typeof Sun;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
