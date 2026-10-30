import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, ThemeProvider } from '@/components/providers';
import { PageLoader, ProtectedLayout } from '@/components/layout';
import '@/i18n';
import './index.css';

// Every page is its own chunk: the landing page does not download the
// charting library, and the analysis page loads only when opened.
const LandingPage = lazy(() => import('@/pages/public/LandingPage').then((m) => ({ default: m.LandingPage })));
const AuthPage = lazy(() => import('@/pages/public/AuthPage').then((m) => ({ default: m.AuthPage })));
const MyPortfolios = lazy(() => import('@/pages/private/MyPortfolios').then((m) => ({ default: m.MyPortfolios })));
const PortfolioDetail = lazy(() =>
  import('@/pages/private/PortfolioDetail').then((m) => ({ default: m.PortfolioDetail }))
);
const PortfolioAnalyze = lazy(() =>
  import('@/pages/private/PortfolioAnalyze').then((m) => ({ default: m.PortfolioAnalyze }))
);
const Profile = lazy(() => import('@/pages/private/Profile').then((m) => ({ default: m.Profile })));
// Dev-only UI preview with synthetic data; compiled out of production builds.
const DevPreview = import.meta.env.DEV ? lazy(() => import('@/dev/DevPreview')) : null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader fullScreen />}>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/auth" element={<AuthPage />} />
                {/* Redirect old routes to unified auth */}
                <Route path="/login" element={<Navigate to="/auth" replace />} />
                <Route path="/register" element={<Navigate to="/auth" replace />} />
                <Route path="/dashboard" element={<Navigate to="/my-portfolios" replace />} />

                {/* Private Routes (shared header, lazy pages) */}
                <Route element={<ProtectedLayout />}>
                  <Route path="/my-portfolios" element={<MyPortfolios />} />
                  <Route path="/portfolio/:slug" element={<PortfolioDetail />} />
                  <Route path="/portfolio/:slug/analyze" element={<PortfolioAnalyze />} />
                  <Route path="/profile" element={<Profile />} />
                </Route>

                {DevPreview && <Route path="/dev/*" element={<DevPreview />} />}

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
