import { lazy, Suspense, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { BottomNav } from '@/components/layout/BottomNav';
import { Header } from '@/components/layout/Header';
import { PageLoader } from '@/components/layout/PageLoader';
import { AuthContext, type AuthContextType } from '@/hooks/authContext';
import { MOCK_ANALYSES, MOCK_PORTFOLIOS, MOCK_PUBLIC, MOCK_PUBLIC_LIST, MOCK_TRANSACTIONS } from './mockData';

const Overview = lazy(() => import('@/pages/private/Overview').then((m) => ({ default: m.Overview })));
const MyPortfolios = lazy(() => import('@/pages/private/MyPortfolios').then((m) => ({ default: m.MyPortfolios })));
const PortfolioDetail = lazy(() => import('@/pages/private/PortfolioDetail').then((m) => ({ default: m.PortfolioDetail })));
const PortfolioAnalyze = lazy(() => import('@/pages/private/PortfolioAnalyze').then((m) => ({ default: m.PortfolioAnalyze })));
const Explore = lazy(() => import('@/pages/public/Explore').then((m) => ({ default: m.Explore })));
const ExplorePortfolio = lazy(() => import('@/pages/public/ExplorePortfolio').then((m) => ({ default: m.ExplorePortfolio })));
const Profile = lazy(() => import('@/pages/private/Profile').then((m) => ({ default: m.Profile })));

/** Query cache pre-filled with synthetic data; nothing is ever fetched. */
function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false, refetchOnWindowFocus: false } },
  });
  client.setQueryData(['portfolios'], MOCK_PORTFOLIOS);
  client.setQueryData(['explore'], MOCK_PUBLIC_LIST);
  for (const p of MOCK_PUBLIC) client.setQueryData(['explore', p.slug], p);
  for (const p of MOCK_PORTFOLIOS) {
    client.setQueryData(['portfolio', p.slug], p);
    client.setQueryData(['transactions', p.slug], MOCK_TRANSACTIONS[p.slug] ?? []);
    client.setQueryData(['rights-issues', p.id], []);
    client.setQueryData(['fund-prices', p.id], [
      { ticker: 'IPB.TEFAS', first_date: '2021-11-01', last_date: '2026-10-30', days: 1258 },
    ]);
    if (MOCK_ANALYSES[p.id]) client.setQueryData(['portfolio-analysis', p.id], MOCK_ANALYSES[p.id]);
  }
  return client;
}

const AUTH: AuthContextType = {
  user: { id: 'dev', email: 'onizleme@example.com', user_metadata: { full_name: 'Önizleme Kullanıcısı' }, created_at: '2026-01-30T10:00:00Z' } as unknown as User,
  session: null,
  isAuthenticated: true,
  isLoading: false,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
};

/**
 * Dev-only preview of the signed-in pages with synthetic data, mounted at
 * /dev/* (e.g. /dev/overview, /dev/my-portfolios, /dev/portfolio/buber-fon/analyze).
 * In-page links point at the real routes; open preview pages by URL.
 */
export default function DevPreview() {
  const [client] = useState(seededClient);
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={AUTH}>
        <div className="min-h-screen flex flex-col bg-background">
          <Header />
          <main className="flex-1">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="overview" element={<Overview />} />
                <Route path="my-portfolios" element={<MyPortfolios />} />
                <Route path="portfolio/:slug" element={<PortfolioDetail />} />
                <Route path="portfolio/:slug/analyze" element={<PortfolioAnalyze />} />
                <Route path="explore" element={<Explore />} />
                <Route path="explore/:slug" element={<ExplorePortfolio />} />
                <Route path="profile" element={<Profile />} />
              </Routes>
            </Suspense>
          </main>
          <BottomNav />
        </div>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
