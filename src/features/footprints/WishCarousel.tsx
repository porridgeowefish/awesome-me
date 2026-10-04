import { interfaceText, interfaceIcon } from '@/shared/content/interface';
import { useState, type CSSProperties } from 'react';
import { Icon } from '@/shared/ui/Icon';
import type { Wish } from '@/data/types';
import { useInterval } from '@/shared/hooks/useInterval';
import { useReducedMotion } from '@/shared/hooks/useMediaQuery';
import { ringOffset } from '@/shared/lib/ring';

interface Props {
  wishes: Wish[];
  activeId: string | null;
  onPick: (w: Wish) => void;
}

/**
 * 「下一次想去」：纯文字小卡片排在一个竖直的滚筒上自动轮转（hover / focus 时暂停）。
 */
export function WishCarousel({ wishes, activeId, onPick }: Props) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [stopped, setStopped] = useState(false); // explicit pause (works on touch screens too — WCAG 2.2.2)
  const n = wishes.length;
  useInterval(() => setIndex((i) => (i + 1) % n), hovered || stopped || reduced || n < 2 ? null : 2800);

  if (!n) return null;

  return (
    <div
      className={`wish-drum ${reduced ? 'is-static' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-label={interfaceText("下一次想去的地方")}
    >
      {wishes.map((w, i) => {
        const off = ringOffset(i, index, n);
        return (
          <button
            key={w.id}
            className={`wish-card ${off === 0 ? 'is-front' : ''} ${activeId === w.id ? 'is-picked' : ''}`}
            style={{ '--off': off, '--abs': Math.abs(off) } as CSSProperties}
            tabIndex={reduced || Math.abs(off) <= 1 ? 0 : -1}
            aria-hidden={!reduced && Math.abs(off) > 2}
            onClick={() => {
              setIndex(i);
              onPick(w);
            }}
          >
            <span className="wish-region">{w.region}</span>
            <strong>{w.name}</strong>
            <span className="wish-reason">{w.reason}</span>
          </button>
        );
      })}
      {!reduced && n > 1 && (
        <button className="wish-toggle" onClick={() => setStopped((s) => !s)} aria-label={stopped ? interfaceText("继续轮转") : interfaceText("暂停轮转")}>
          <Icon name={stopped ? interfaceIcon('wish.play','play') : interfaceIcon('wish.pause','pause')} solid size={12} />
        </button>
      )}
      {!reduced && (
        <div className="wish-dots" aria-hidden>
          {wishes.map((w, i) => (
            <i key={w.id} className={i === index ? 'on' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}
