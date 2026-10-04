import { Suspense, type ReactNode } from 'react';
import { createBrowserRouter, createHashRouter, Navigate, useLocation, type RouteObject } from 'react-router-dom';
import { site } from '@/config/site';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { Loading } from '@/shared/ui/states';
import { pages } from './features';
import { Shell } from './Shell';
import { lazyWithReload } from '@/shared/lib/lazyWithReload';
const AdminPage=lazyWithReload(()=>import('@/features/admin/AdminPage'));

/** Per-route fault isolation that resets when the URL changes (e.g. moving to another essay). */
function RouteBoundary({ label, children }: { label: string; children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary label={label} resetKey={pathname}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/** Routes are generated from the feature registry; every feature gets its own Suspense + ErrorBoundary. */
export function buildRoutes(): RouteObject[] {
  const children: RouteObject[] = pages.flatMap((page) =>
    page.routes.map(({ path, component: Page }) => {
      const full = [page.path, path].filter(Boolean).join('/');
      return {
        path: full || undefined,
        index: !full,
        element: (
          <RouteBoundary label={page.label}>
            <Page />
          </RouteBoundary>
        ),
      } as RouteObject;
    }),
  );
  children.push({ path: '*', element: <Navigate to="/" replace /> });
  return [{ path:'/admin/:section?', element:<RouteBoundary label="管理台"><AdminPage/></RouteBoundary> },{ path: '/', element: <Shell />, children }];
}

export function createRouter() {
  const routes = buildRoutes();
  return site.routerMode === 'history'
    ? createBrowserRouter(routes, { basename: import.meta.env.BASE_URL })
    : createHashRouter(routes);
}
