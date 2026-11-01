import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { Header } from '@/components/layout';
import { Logo } from '@/components/layout/Logo';
import { useAuth, useDocumentTitle, useTheme } from '@/hooks';
import { authErrorKey } from '@/lib/authErrors';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export function AuthPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithGoogle } = useAuth();
  const { theme } = useTheme();
  useDocumentTitle(t('common.signIn'));
  // Back to the private page that sent the user here, else Explore.
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  const home = from && from !== '/auth' ? from : '/explore';

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(GOOGLE_CLIENT_ID ? '' : t('auth.errors.googleUnavailable'));

  const handleCredential = async (credential: string, nonce: string) => {
    setError('');
    setIsLoading(true);
    try {
      const { error: authError } = await signInWithGoogle(credential, nonce);
      if (authError) {
        setError(t(authErrorKey(authError, 'auth.errors.googleFailed')));
      } else {
        navigate(home, { replace: true });
      }
    } catch (err) {
      setError(t(authErrorKey(err, 'auth.errors.googleFailed')));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 grid lg:grid-cols-2">
        {/* Brand panel */}
        <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-primary-fill p-12 text-primary-foreground">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{
              background:
                'radial-gradient(60% 50% at 100% 0%, rgb(255 255 255 / 0.18), transparent 70%), radial-gradient(50% 50% at 0% 100%, rgb(0 0 0 / 0.18), transparent 70%)',
            }}
          />
          <Logo inverted className="relative" />
          <div className="relative max-w-md">
            <h2 className="text-3xl font-bold tracking-tight leading-tight">{t('auth.brand.title')}</h2>
            <ul className="mt-8 space-y-4">
              {(['fund', 'compare', 'automatic'] as const).map((key) => (
                <li key={key} className="flex gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 opacity-90" aria-hidden="true" />
                  <span className="opacity-90">{t(`auth.brand.points.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-sm opacity-75">{t('landing.footer.copyright')}</p>
        </aside>

        {/* Sign in */}
        <div className="flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-5">
              <LogIn className="h-6 w-6" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">{t('auth.welcome')}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t('auth.subtitle')}</p>

            <div className="mt-6 space-y-4">
              {GOOGLE_CLIENT_ID &&
                (isLoading ? (
                  <p className="flex h-11 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {t('auth.signingIn')}
                  </p>
                ) : (
                  <GoogleSignInButton
                    clientId={GOOGLE_CLIENT_ID}
                    onCredential={handleCredential}
                    onLoadError={() => setError(t('auth.errors.googleUnavailable'))}
                    theme={theme}
                    locale={i18n.resolvedLanguage ?? 'tr'}
                  />
                ))}

              {error && (
                <p className="flex items-start gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'hsl(var(--destructive) / 0.4)', backgroundColor: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }} role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  {error}
                </p>
              )}
            </div>

            <p className="mt-8 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {t('auth.secureNote')}{' '}
                <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                  {t('auth.privacy')}
                </a>
              </span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
