import { interfaceText } from '@/shared/content/interface';
import { useEffect, useState } from 'react';
import type { TocItem } from '@/shared/markdown/slug';

/** Sticky outline that highlights the heading currently in view. */
export function TableOfContents({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav className="toc" aria-label={interfaceText("文章目录")}>
      <div className="eyebrow">{interfaceText("Contents")}</div>
      <ul>
        {items.map((i) => (
          <li key={i.id} className={`toc-d${i.depth} ${active === i.id ? 'active' : ''}`}>
            <a
              href={`#${i.id}`}
              onClick={(e) => {
                e.preventDefault(); // hash router: don't touch location.hash
                document.getElementById(i.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setActive(i.id);
              }}
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
