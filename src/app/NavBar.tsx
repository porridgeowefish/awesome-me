import { interfaceText, interfaceIcon } from '@/shared/content/interface';
import { NavLink } from 'react-router-dom';
import { useSiteContent } from '@/shared/content/runtime';
import { useTheme } from '@/shared/hooks/useTheme';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { publicUrl } from '@/shared/lib/url';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { features, pages } from './features';
import { CursorPicker } from '@/shared/ui/PersonalCursor';

export function NavBar() {
  const { settings: site } = useSiteContent();
  const [theme, toggleTheme] = useTheme();
  return (
    <header className="nav">
      <div className="nav-inner">
        <NavLink to="/" className="nav-brand" aria-label={`${site.name} ${interfaceText("首页")}`}>
          <img data-edit-region="site:logo" src={publicUrl(site.logo)} alt="" width={30} height={31} className="nav-brand-head" />
          <span data-edit-region="site:name" data-edit-inline="true" className="nav-brand-name">{site.name}</span>
          <span data-edit-region="site:nameEn" data-edit-inline="true" className="nav-brand-en">{site.nameEn}</span>
        </NavLink>
        <nav className="nav-tabs" aria-label={interfaceText("主导航")}>
          {site.navigation.filter(f => f.visible).map((f) => (
            <NavLink key={f.id} to={`/${pages.find(page => page.id === f.id)?.path ?? ''}`} end={f.id === 'me'} className="nav-tab">
              <Icon name={f.icon as IconName} size={17} className="nav-tab-icon" />
              <span className="nav-tab-label" data-edit-region={`site:navigation.${site.navigation.indexOf(f)}.label`} data-edit-inline="true">{f.label}</span>
              <span className="nav-tab-en" aria-hidden data-edit-region={`site:navigation.${site.navigation.indexOf(f)}.labelEn`} data-edit-inline="true">
                {f.labelEn}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="nav-widgets">
          {features.map((f) =>
            f.NavWidget ? (
              <ErrorBoundary key={f.id} label={f.id} fallback={() => null}>
                <f.NavWidget />
              </ErrorBoundary>
            ) : null,
          )}
        </div>
        <CursorPicker />
        <button className="icon-btn nav-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? interfaceText("切换到浅色") : interfaceText("切换到深色")}>
          <Icon name={theme === 'dark' ? interfaceIcon('nav.theme.sun','sun') : interfaceIcon('nav.theme.moon','moon')} />
        </button>
      </div>
    </header>
  );
}
