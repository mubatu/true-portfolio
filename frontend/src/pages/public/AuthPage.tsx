import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PasswordRequirements } from '@/components/ui/PasswordRequirements';
import { validatePassword } from '@/lib/password';
import { Header } from '@/components/layout';
import { useAuth } from '@/hooks';
import { checkEmailExists } from '@/lib/api';

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
        console.error('Login error:', authError);
        setError(authError.message || t('auth.errors.invalidCredentials'));
      } else {
        navigate('/my-portfolios');
      }
    } catch (err) {
      console.error('Login exception:', err);
      setError(t('auth.errors.invalidCredentials'));
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
        setError(authError.message || t('auth.errors.registrationFailed'));
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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="rounded-lg border p-8" style={{ borderColor: 'hsl(var(--border))' }}>
            {/* Email Step */}
            {step === 'email' && (
              <form onSubmit={handleEmailSubmit}>
                <h1 className="text-2xl font-bold text-center mb-2">
                  {t('auth.welcome')}
                </h1>
                <p className="text-center mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {t('auth.enterEmail')}
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium mb-2">
                      {t('auth.email')}
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('auth.emailPlaceholder')}
                      required
                      className="w-full px-3 py-2 rounded-md border bg-transparent"
                      style={{ borderColor: 'hsl(var(--input))' }}
                    />
                  </div>

                  {error && (
                    <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full gap-2" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        {t('auth.continue')} <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}

            {/* Login Step */}
            {step === 'login' && (
              <form onSubmit={handleLoginSubmit}>
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-sm mb-4 hover:underline"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <ArrowLeft className="h-4 w-4" /> {t('auth.back')}
                </button>
                
                <h1 className="text-2xl font-bold text-center mb-2">
                  {t('auth.welcomeBack')}
                </h1>
                <p className="text-sm text-center mb-2 font-medium">{email}</p>
                <p className="text-center text-sm mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {t('auth.loginSubtitle')}
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium mb-2">
                      {t('auth.password')}
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('auth.passwordPlaceholder')}
                      required
                      className="w-full px-3 py-2 rounded-md border bg-transparent"
                      style={{ borderColor: 'hsl(var(--input))' }}
                    />
                  </div>

                  {error && (
                    <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
                      {error}
                    </p>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('auth.signIn')
                    )}
                  </Button>
                </div>
              </form>
            )}

            {/* Register Step */}
            {step === 'register' && (
              <form onSubmit={handleRegisterSubmit}>
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 text-sm mb-4 hover:underline"
                  style={{ color: 'hsl(var(--muted-foreground))' }}
                >
                  <ArrowLeft className="h-4 w-4" /> {t('auth.back')}
                </button>
                
                <h1 className="text-2xl font-bold text-center mb-2">
                  {t('auth.createAccount')}
                </h1>
                <p className="text-sm text-center mb-2 font-medium">{email}</p>
                <p className="text-center text-sm mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {t('auth.registerSubtitle')}
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium mb-2">
                      {t('auth.name')}
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('auth.namePlaceholder')}
                      required
                      className="w-full px-3 py-2 rounded-md border bg-transparent"
                      style={{ borderColor: 'hsl(var(--input))' }}
                    />
                  </div>

                  <div>
                    <label htmlFor="register-password" className="block text-sm font-medium mb-2">
                      {t('auth.password')}
                    </label>
                    <input
                      id="register-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('auth.createPasswordPlaceholder')}
                      required
                      className="w-full px-3 py-2 rounded-md border bg-transparent"
                      style={{ borderColor: 'hsl(var(--input))' }}
                    />
                    <PasswordRequirements password={password} show={password.length > 0} />
                  </div>

                  {error && (
                    <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
                      {error}
                    </p>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading || !validatePassword(password)}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('auth.createAccount')
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
