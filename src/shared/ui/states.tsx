import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './states.css';

export function Loading({ label = '加载中' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="pixel-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
    </div>
  );
}

export function Empty({ icon = 'sparkle', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
