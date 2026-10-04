import { useMemo, type ReactNode } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { features } from './features';
import { createRouter } from './router';
import { ContentProvider } from '@/shared/content/runtime';

/** Compose every feature-level Provider around the router (order = registry order). */
function FeatureProviders({ children }: { children: ReactNode }) {
  return features.reduceRight<ReactNode>((acc, f) => (f.Provider ? <f.Provider key={f.id}>{acc}</f.Provider> : acc), children);
}

export function App() {
  const router = useMemo(createRouter, []);
  // If a global provider crashes, keep the site usable without it rather than showing a blank page.
  return (
    <ContentProvider><ErrorBoundary label="全局服务" fallback={() => <RouterProvider router={router} />}>
      <FeatureProviders>
        <RouterProvider router={router} />
      </FeatureProviders>
    </ErrorBoundary></ContentProvider>
  );
}
