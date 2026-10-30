import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BarChart3, Shield, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout';
import { useAuth } from '@/hooks/useAuth';

export function LandingPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl mb-6">
            {t('landing.hero.title')}
            <br />
            <span style={{ color: 'hsl(var(--primary))' }}>{t('landing.hero.titleHighlight')}</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground mb-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {t('landing.hero.subtitle')}
          </p>
          <div className="flex justify-center gap-4">
            <Link to={isAuthenticated ? '/my-portfolios' : '/auth'}>
              <Button size="lg" className="gap-2">
                {t('common.getStarted')} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Features Section */}
        <section className="container mx-auto px-4 py-16">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<BarChart3 className="h-10 w-10" style={{ color: 'hsl(var(--primary))' }} />}
              title={t('landing.features.analytics.title')}
              description={t('landing.features.analytics.description')}
            />
            <FeatureCard
              icon={<Shield className="h-10 w-10" style={{ color: 'hsl(var(--primary))' }} />}
              title={t('landing.features.security.title')}
              description={t('landing.features.security.description')}
            />
            <FeatureCard
              icon={<Zap className="h-10 w-10" style={{ color: 'hsl(var(--primary))' }} />}
              title={t('landing.features.speed.title')}
              description={t('landing.features.speed.description')}
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {t('landing.footer.copyright')}
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ 
  icon, 
  title, 
  description 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
}) {
  return (
    <div className="rounded-lg border p-6 text-center" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="flex justify-center mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p style={{ color: 'hsl(var(--muted-foreground))' }}>{description}</p>
    </div>
  );
}
