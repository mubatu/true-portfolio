import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PasswordRequirements } from '@/components/ui/PasswordRequirements';
import { TextField } from '@/components/ui/TextField';
import { validatePassword } from '@/lib/password';
import { Header } from '@/components/layout';
import { useAuth } from '@/hooks';
import { checkEmailExists } from '@/lib/api';
import { authErrorKey } from '@/lib/authErrors';

type AuthStep = 'email' | 'login' | 'register';

export function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  
  const [step, setStep] = useState<AuthStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { exists } = await checkEmailExists(email);
      setStep(exists ? 'login' : 'register');
    } catch {
      setError(t('auth.errors.emailCheck'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { error: authError } = await signIn(email, password);
      if (authError) {
        setError(t(authErrorKey(authError, 'auth.errors.invalidCredentials')));
      } else {
        navigate('/my-portfolios');
      }
    } catch (err) {
      setError(t(authErrorKey(err, 'auth.errors.invalidCredentials')));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { error: authError } = await signUp(email, password, name);
      if (authError) {
        setError(t(authErrorKey(authError, 'auth.errors.registrationFailed')));
      } else {
        navigate('/my-portfolios');
      }
    } catch {
      setError(t('auth.errors.registrationFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setPassword('');
    setName('');
    setError('');
  };

  const subtitle =
    step === 'email' ? t('auth.enterEmail') : step === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle');
  const title = step === 'email' ? t('auth.welcome') : step === 'login' ? t('auth.welcomeBack') : t('auth.createAccount');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 grid lg:grid-cols-2">
        {/* Brand panel */}
        <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{
              background:
                'radial-gradient(60% 50% at 100% 0%, rgb(255 255 255 / 0.18), transparent 70%), radial-gradient(50% 50% at 0% 100%, rgb(0 0 0 / 0.18), transparent 70%)',
            }}
          />
          <span className="relative text-sm font-semibold tracking-wide opacity-80">{t('common.appName')}</span>
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

        {/* Form */}
        <div className="flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-sm">
            {step !== 'email' && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1 text-sm mb-6 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> {t('auth.back')}
              </button>
            )}

            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-5">
              {step === 'register' ? <UserPlus className="h-6 w-6" /> : step === 'login' ? <KeyRound className="h-6 w-6" /> : <LogIn className="h-6 w-6" />}
            </span>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

            {step !== 'email' && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm font-medium">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {email}
              </p>
            )}

            <form
              onSubmit={step === 'email' ? handleEmailSubmit : step === 'login' ? handleLoginSubmit : handleRegisterSubmit}
              className="mt-6 space-y-4"
            >
              {step === 'email' && (
                <TextField
                  id="email"
                  type="email"
                  label={t('auth.email')}
                  icon={Mail}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  autoComplete="email"
                  autoFocus
                  required
                />
              )}

              {step === 'register' && (
                <TextField
                  id="name"
                  label={t('auth.name')}
                  icon={User}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('auth.namePlaceholder')}
                  autoComplete="name"
                  autoFocus
                  required
                />
              )}

              {step !== 'email' && (
                <div>
                  <TextField
                    id={step === 'login' ? 'password' : 'register-password'}
                    type="password"
                    label={t('auth.password')}
                    icon={Lock}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t(step === 'login' ? 'auth.passwordPlaceholder' : 'auth.createPasswordPlaceholder')}
                    autoComplete={step === 'login' ? 'current-password' : 'new-password'}
                    autoFocus={step === 'login'}
                    required
                  />
                  {step === 'register' && <PasswordRequirements password={password} show={password.length > 0} />}
                </div>
              )}

              {error && (
                <p className="flex items-start gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'hsl(var(--destructive) / 0.4)', backgroundColor: 'hsl(var(--destructive) / 0.08)', color: 'hsl(var(--destructive))' }} role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full h-11 rounded-xl gap-2"
                disabled={isLoading || (step === 'register' && !validatePassword(password))}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : step === 'email' ? (
                  <>
                    {t('auth.continue')} <ArrowRight className="h-4 w-4" />
                  </>
                ) : step === 'login' ? (
                  t('auth.signIn')
                ) : (
                  t('auth.createAccount')
                )}
              </Button>
            </form>

            <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t('auth.secureNote')}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
