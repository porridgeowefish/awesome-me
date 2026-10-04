import { interfaceText } from '@/shared/content/interface';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { Icon } from '@/shared/ui/Icon';
import { useSiteContent } from '@/shared/content/runtime';
import { PixelAvatar } from './avatar/PixelAvatar';
import { TrailRunner } from './game/TrailRunner';
import { ProfileSection } from './profile/ProfileSection';
import './me.css';

export default function MePage() {
  const { profile, copy, settings } = useSiteContent();
  useDocumentTitle();
  if (!profile) return <div className="page">{interfaceText("个人资料尚未设置。")}</div>;
  return (
    <div className="page me-page fade-in">
      <div className="page-head me-head">
        <div>
          <div className="eyebrow" data-edit-region="site:copy.me.eyebrow" data-edit-inline="true">{copy('me.eyebrow')}</div>
          <h1>
            <span data-edit-region="site:copy.me.greeting" data-edit-inline="true">{copy('me.greeting')}</span><span data-edit-region="profile:name" data-edit-inline="true">{profile.name}</span>
            <span className="wave" aria-hidden>
              {interfaceText("_")}</span>
          </h1>
        </div>
        <p><span data-edit-region="profile:headline" data-edit-inline="true">{profile.headline}</span> {interfaceText("·")}<span data-edit-region="site:copy.me.subtitle" data-edit-inline="true">{copy('me.subtitle')}</span></p>
      </div>

      {(settings.play?.game === true || settings.play?.avatar !== false) && <div className={`me-play ${settings.play?.game !== true || settings.play?.avatar === false ? 'me-play-single' : ''}`}>
        {settings.play?.game === true && <section className="card play-card game-card">
          <header className="card-head">
            <Icon name="gamepad" size={18} />
            <strong>小游戏</strong>
            <span className="muted">山野快跑</span>
          </header>
          <ErrorBoundary label="小游戏">
            <TrailRunner />
          </ErrorBoundary>
        </section>}
        {settings.play?.avatar !== false && <section className="card play-card avatar-card">
          <header className="card-head">
            <Icon name="sparkle" size={18} />
            <strong>动画形象</strong>
            <span className="muted">点我</span>
          </header>
          <PixelAvatar />
        </section>}
      </div>}

      <ProfileSection />
    </div>
  );
}
