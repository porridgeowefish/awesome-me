import type { CSSProperties } from 'react';
import { hashString } from '@/shared/lib/hash';

const PALETTES = [
  ['#2f80ed', '#e3eefc'],
  ['#3f9b4a', '#e3f2e1'],
  ['#ef7a2b', '#fdebdc'],
  ['#7b5cd6', '#ece6fb'],
  ['#c2415d', '#fbe4ea'],
  ['#0f8b8d', '#dcf2f2'],
] as const;

interface Props {
  topic: string;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'lg';
}

/**
 * Typographic cover for essays without a picture: 主题 + 副标题 on a pixel pattern whose
 * colour and layout are derived from the title (stable across builds).
 */
export function TitleCover({ topic, title, subtitle, size = 'sm' }: Props) {
  const h = hashString(title);
  const [fg, bg] = PALETTES[h % PALETTES.length];
  const cells = Array.from({ length: 24 }, (_, i) => (h >> i) & 1);
  return (
    <div className={`title-cover title-cover-${size}`} style={{ '--tc-fg': fg, '--tc-bg': bg } as CSSProperties} aria-hidden>
      <div className="tc-pixels">
        {cells.map((on, i) => (
          <i key={i} style={{ opacity: on ? 0.9 - (i % 6) * 0.12 : 0 }} />
        ))}
      </div>
      <span className="tc-topic">{topic}</span>
      <strong className="tc-title">{size === 'lg' ? title : (subtitle ?? title)}</strong>
      {size === 'lg' && subtitle && <span className="tc-sub">{subtitle}</span>}
    </div>
  );
}
