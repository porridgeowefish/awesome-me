import { useState } from 'react';
import { publicUrl } from '@/shared/lib/url';
import { useInterval } from '@/shared/hooks/useInterval';
import { useReducedMotion } from '@/shared/hooks/useMediaQuery';
import './avatar.css';

const LINES = [
  '嗨，我是示例站主。',
  '写一篇文章，记录新的发现。',
  '这里展示你的生活与创作。',
  '从一个小小的数字花园开始。',
  '先想清验收标准，再动手。',
  '点我，我会跳一下。',
];

/**
 * 动画形象：像素风的我站在山顶，云在飘、人在呼吸，点击会跳起来并换一句台词。
 * Layers: scene (character removed) → drifting clouds → character sprite → speech bubble.
 */
export function PixelAvatar() {
  const reduced = useReducedMotion();
  const [line, setLine] = useState(0);
  const [jumping, setJumping] = useState(false);
  useInterval(() => setLine((l) => (l + 1) % LINES.length), reduced ? null : 4200);

  const poke = () => {
    setLine((l) => (l + 1) % LINES.length);
    if (jumping) return;
    setJumping(true);
    window.setTimeout(() => setJumping(false), 600);
  };

  return (
    <div className="avatar-stage">
      <img className="avatar-scene" src={publicUrl('images/me/scene-bg.webp')} alt="" draggable={false} />
      <div className="avatar-clouds" aria-hidden>
        <i className="c1" />
        <i className="c2" />
        <i className="c3" />
      </div>
      <button className={`avatar-hero ${jumping ? 'jump' : ''}`} onClick={poke} aria-label="和像素形象打个招呼">
        <img src={publicUrl('images/me/pixel-me.webp')} alt="通用像素风示例角色" draggable={false} />
      </button>
      <div className="avatar-bubble" key={line}>
        {LINES[line]}
      </div>
      <span className="avatar-badge">PIXEL ME</span>
    </div>
  );
}
