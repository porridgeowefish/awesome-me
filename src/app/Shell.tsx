import { interfaceText } from '@/shared/content/interface';
import { Fragment, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { features } from './features';
import { NavBar } from './NavBar';
import { useSiteContent } from '@/shared/content/runtime';
import './shell.css';
import { EditPreview } from '@/shared/content/EditPreview';
import { VisitCollector } from '@/shared/content/VisitCollector';
import { PersonalCursor } from '@/shared/ui/PersonalCursor';

export function Shell() {
  const { settings: site } = useSiteContent();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return (
    <div className="shell">
      <EditPreview />
      <VisitCollector />
      <PersonalCursor />
      {/* a button, not href="#main": in hash-router mode the hash is the route */}
      <button className="skip-link" onClick={() => document.getElementById('main')?.focus()}>
        {interfaceText("跳到正文")}</button>
      <NavBar />
      <main id="main" className="shell-main" tabIndex={-1}>
        <ErrorBoundary label="页面" resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="shell-footer">
        <span className="pixel-mark" aria-hidden />
        <span>
          {interfaceText("©")}{new Date().getFullYear()} <span data-edit-region="site:name" data-edit-inline="true">{site.name}</span> {interfaceText("·")}<span data-edit-region="site:footer" data-edit-inline="true" data-edit-multiline="true">{site.footer}</span>
        </span>
        <Link to="/admin" className="shell-admin-link">管理网站 ↗</Link>
      </footer>
      {features.map((f) =>
        f.Widget ? (
          <ErrorBoundary key={f.id} label={f.id} fallback={() => null}>
            <f.Widget />
          </ErrorBoundary>
        ) : (
          <Fragment key={f.id} />
        ),
      )}
    </div>
  );
}
