import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Coins,
  EyeOff,
  Landmark,
  Layers,
  LineChart,
  ListPlus,
  Scale,
  Scissors,
  Sparkles,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/components/analysis/format';
import { ExploreShowcaseCard } from '@/components/explore/ExploreParts';
import { Header } from '@/components/layout';
import { Logo } from '@/components/layout/Logo';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getPublicPortfolios } from '@/lib/api';

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: 'fund', icon: LineChart },
  { key: 'compare', icon: Scale },
  { key: 'dividends', icon: Coins },
  { key: 'corporate', icon: Scissors },
  { key: 'tefas', icon: Landmark },
  { key: 'perStock', icon: Layers },
];

const STEPS: { key: string; icon: LucideIcon }[] = [
  { key: 'create', icon: Wallet },
  { key: 'trades', icon: ListPlus },
  { key: 'insights', icon: Sparkles },
];

export function LandingPage() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const start = isAuthenticated ? '/my-portfolios' : '/auth';

  useDocumentTitle();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 -z-0"
            aria-hidden="true"
            style={{
              background:
                'radial-gradient(60% 50% at 80% 10%, hsl(var(--primary) / 0.14), transparent 70%), radial-gradient(40% 40% at 0% 100%, hsl(var(--primary) / 0.08), transparent 70%)',
            }}
          />
          <div className="relative container mx-auto max-w-7xl px-4 pt-16 pb-20 md:pt-24 md:pb-28 grid gap-12 lg:grid-cols-[1.05fr_1fr] items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {t('landing.hero.eyebrow')}
              </span>
              <h1 className="mt-5 text-4xl sm:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.05]">
                {t('landing.hero.title')}{' '}
                <span className="bg-gradient-to-r from-[hsl(var(--logo-from))] to-[hsl(var(--logo-to))] bg-clip-text text-transparent">
                  {t('landing.hero.titleHighlight')}
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">{t('landing.hero.subtitle')}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={start}>
                  <Button size="lg" className="gap-2 rounded-full px-6 h-11">
                    {isAuthenticated ? t('common.myPortfolios') : t('common.getStarted')}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="#how-it-works">
                  <Button size="lg" variant="ghost" className="rounded-full px-6 h-11">
                    {t('landing.hero.howItWorks')}
                  </Button>
                </a>
              </div>
              <ul className="mt-8 grid gap-2 sm:grid-cols-2 max-w-xl text-sm">
                {(['bist', 'dividends', 'splits', 'compare'] as const).map((key) => (
                  <li key={key} className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {t(`landing.hero.points.${key}`)}
                  </li>
                ))}
              </ul>
            </div>

            <ExploreShowcase />
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto max-w-7xl px-4 py-16 md:py-24">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight">{t('landing.features.title')}</h2>
            <p className="mt-3 text-muted-foreground">{t('landing.features.subtitle')}</p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon }) => (
              <div key={key} className="rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold">{t(`landing.features.items.${key}.title`)}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{t(`landing.features.items.${key}.description`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y bg-card/60 scroll-mt-16">
          <div className="container mx-auto max-w-7xl px-4 py-16 md:py-24">
            <h2 className="text-3xl font-bold tracking-tight text-center">{t('landing.steps.title')}</h2>
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map(({ key, icon: Icon }, i) => (
                <li key={key} className="relative text-center">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="mt-4 block text-xs font-semibold uppercase tracking-wider text-primary">
                    {t('landing.steps.step', { n: i + 1 })}
                  </span>
                  <h3 className="mt-1 text-lg font-semibold">{t(`landing.steps.items.${key}.title`)}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground max-w-xs mx-auto">
                    {t(`landing.steps.items.${key}.description`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t bg-card/60">
        <div className="container mx-auto max-w-7xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Logo />
          <p className="text-sm text-muted-foreground">{t('landing.footer.copyright')}</p>
        </div>
      </footer>
    </div>
  );
}

/** How many public portfolios the hero shows. */
const SHOWCASE_SIZE = 3;

/**
 * The hero's right side: the best public portfolios from Explore, live.
 * Until there are any (or when they cannot be loaded) the made-up preview
 * stands in, so the hero is never empty.
 */
function ExploreShowcase() {
  const { t } = useTranslation();
  const fmt = useFormatters('TRY');
  // The same query as the Explore page: opening it after this is instant.
  const { data, isLoading } = useQuery({ queryKey: ['explore'], queryFn: getPublicPortfolios });
  const top = data?.slice(0, SHOWCASE_SIZE) ?? [];

  if (!isLoading && top.length === 0) return <HeroPreview />;

  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-2xl" aria-hidden="true" />
      <section
        className="relative rounded-3xl border bg-card/80 backdrop-blur-sm p-4 md:p-5 shadow-xl"
        aria-labelledby="showcase-title"
      >
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <h2 id="showcase-title" className="font-semibold flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
              {t('landing.showcase.title')}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('explore.amountsHidden')}
            </p>
          </div>
          <Link
            to="/explore"
            className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t('landing.showcase.seeAll')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-4 flex flex-col gap-3" aria-busy={isLoading}>
          {isLoading
            ? Array.from({ length: SHOWCASE_SIZE }, (_, i) => (
                <div key={i} className="h-[212px] rounded-2xl border bg-muted/40 animate-pulse" />
              ))
            : top.map((p) => <ExploreShowcaseCard key={p.slug} portfolio={p} fmt={fmt} />)}
        </div>

        {data && data.length > SHOWCASE_SIZE && (
          <p className="mt-3 px-1 text-xs text-muted-foreground">
            {t('landing.showcase.more', { count: data.length - SHOWCASE_SIZE })}
          </p>
        )}
      </section>
    </div>
  );
}

// A deterministic, made-up unit price path: the hero shows what the
// analysis page looks like without loading the charting library.
const PATH = (() => {
  const values: number[] = [];
  let v = 1;
  for (let i = 0; i < 60; i++) {
    v *= 1 + 0.006 + Math.sin(i * 0.7) * 0.012 + Math.cos(i * 1.9) * 0.008;
    values.push(v);
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((y, i) => [(i / (values.length - 1)) * 300, 110 - ((y - min) / (max - min)) * 95] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const bench = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${(y * 0.55 + 45 + Math.sin(i * 0.5) * 4).toFixed(1)}`).join(' ');
  return { line, area: `${line} L300,120 L0,120 Z`, bench, last: values[values.length - 1] };
})();

function HeroPreview() {
  const { t, i18n } = useTranslation();
  const pct = (PATH.last - 1) * 100;
  const number = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent', signDisplay: 'always', maximumFractionDigits: 1 });

  return (
    <div className="relative" aria-hidden="true">
      <div className="absolute -inset-4 rounded-[2rem] bg-primary/10 blur-2xl" />
      <div className="relative rounded-3xl border bg-card p-5 md:p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{t('landing.preview.unitPrice')}</p>
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">{number.format(PATH.last)}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold" style={{ backgroundColor: 'hsl(var(--gain) / 0.12)', color: 'hsl(var(--gain))' }}>
            <TrendingUp className="h-4 w-4" />
            {percent.format(pct / 100)}
          </span>
        </div>

        <svg viewBox="0 0 300 120" className="mt-5 w-full h-40" preserveAspectRatio="none">
          <defs>
            <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
              <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[30, 60, 90].map((y) => (
            <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray="3 4" />
          ))}
          <path d={PATH.area} fill="url(#heroFill)" />
          <path d={PATH.bench} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          <path d={PATH.line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        </svg>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {(['bist', 'gold', 'usd'] as const).map((key, i) => (
            <div key={key} className="rounded-xl border bg-background/60 px-3 py-2">
              <p className="text-[11px] text-muted-foreground truncate">{t(`landing.preview.vs.${key}`)}</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: 'hsl(var(--gain))' }}>
                {t('landing.preview.ahead', { value: [12.4, 3.1, 18.7][i].toLocaleString(i18n.language) })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
