import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { PageLoader } from './PageLoader';

/** Layout route for pages open to everyone (Explore): the shared header,
 * signed in or not, above the lazy-loaded page. */
export function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}
