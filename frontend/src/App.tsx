import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, ThemeProvider } from '@/components/providers';
import { ProtectedLayout } from '@/components/layout';
import { LandingPage, AuthPage } from '@/pages/public';
import { Dashboard, MyPortfolios, PortfolioAnalyze, PortfolioDetail, Profile } from '@/pages/private';
import '@/i18n';
import './index.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<AuthPage />} />
              {/* Redirect old routes to unified auth */}
              <Route path="/login" element={<Navigate to="/auth" replace />} />
              <Route path="/register" element={<Navigate to="/auth" replace />} />

              {/* Private Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedLayout>
                    <Dashboard />
                  </ProtectedLayout>
                }
              />
              <Route
                path="/my-portfolios"
                element={
                  <ProtectedLayout>
                    <MyPortfolios />
                  </ProtectedLayout>
                }
              />
              <Route
                path="/portfolio/:slug"
                element={
                  <ProtectedLayout>
                    <PortfolioDetail />
                  </ProtectedLayout>
                }
              />
              <Route
                path="/portfolio/:slug/analyze"
                element={
                  <ProtectedLayout>
                    <PortfolioAnalyze />
                  </ProtectedLayout>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedLayout>
                    <Profile />
                  </ProtectedLayout>
                }
              />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
