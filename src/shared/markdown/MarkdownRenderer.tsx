import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import type { Pluggable, PluggableList } from 'unified';
import { site } from '@/config/site';
import { resolveRelative } from '@/shared/lib/url';
import { Lightbox, type LightboxImage } from '@/shared/ui/Lightbox';
import { Loading } from '@/shared/ui/states';
import { fenceRenderers } from './fenceRenderers';
import { highlightLanguages } from './languages';
import { classifyLink, type RouteResolver } from './linkResolver';
import { rehypeHeadingIds, rehypeResolveUrls } from './rehypePlugins';
import { sanitizeSchema } from './schema';
import type { TocItem } from './slug';
import './markdown.css';

/**
 * Renders essay markdown: GFM (tables, task lists, footnotes), LaTeX math, rich-text HTML
 * (sanitised), ```mermaid diagrams, ```svg pictures / inline <svg>, syntax highlighting,
 * and images that open in the lightbox.
 *
 * Extension points live outside this component: `fenceRenderers` (special code blocks),
 * `highlightLanguages`, `sanitizeSchema`, and the injected `resolveRoute` for in-app links.
 */

interface Props {
  source: string;
  /** Public path of the markdown file; relative links/images resolve against it. */
  basePath: string;
  /** Build-time feature detection; KaTeX is only downloaded when needed. */
  needsMath?: boolean;
  /** Maps hrefs that point at other pages of the app to router paths. */
  resolveRoute?: RouteResolver;
  /** Receives the outline (ids identical to the rendered headings) after each render. */
  onToc?: (items: TocItem[]) => void;
}

let katexPromise: Promise<Pluggable> | null = null;
function loadKatex(): Promise<Pluggable> {
  katexPromise ??= Promise.all([import('rehype-katex'), import('katex/dist/katex.min.css')]).then(([m]) => [
    m.default,
    { throwOnError: false, strict: 'ignore' },
  ]);
  katexPromise.catch(() => (katexPromise = null));
  return katexPromise;
}

const routeHref = (to: string) => (site.routerMode === 'hash' ? `#${to}` : `${import.meta.env.BASE_URL}${to.replace(/^\//, '')}`);

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node && typeof node === 'object' && 'props' in node) return textContent((node as { props: { children?: ReactNode } }).props.children);
  return '';
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="md-copy"
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          })
          .catch(() => undefined);
      }}
    >
      {done ? '已复制' : '复制'}
    </button>
  );
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ source, basePath, needsMath = true, resolveRoute, onToc }: Props) {
  const navigate = useNavigate();
  const [zoom, setZoom] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [katex, setKatex] = useState<Pluggable | null>(null);
  const [katexFailed, setKatexFailed] = useState(false);
  const tocRef = useRef<TocItem[]>([]);
  const onTocRef = useRef(onToc);
  onTocRef.current = onToc;

  useEffect(() => {
    if (!needsMath || katex) return;
    let alive = true;
    loadKatex()
      .then((p) => alive && setKatex(() => p))
      .catch(() => alive && setKatexFailed(true)); // math then stays as plain TeX source
    return () => {
      alive = false;
    };
  }, [needsMath, katex]);

  const ready = !needsMath || !!katex || katexFailed;

  const remarkPlugins = useMemo<PluggableList>(() => [remarkGfm, [remarkMath, { singleDollarTextMath: true }]], []);
  const rehypePlugins = useMemo<PluggableList>(
    () => [
      rehypeRaw,
      [rehypeSanitize, sanitizeSchema],
      [rehypeHeadingIds, { onToc: (items: TocItem[]) => (tocRef.current = items) }], // before KaTeX: ids come from the TeX source
      ...(katex ? [katex] : []),
      [rehypeHighlight, { detect: false, languages: highlightLanguages, aliases: { bash: ['sh', 'shell', 'zsh'], xml: ['html', 'vue'] } }],
      [rehypeResolveUrls, { resolve: (url: string) => resolveRelative(basePath, url) }],
    ],
    [basePath, katex],
  );

  // Publish the outline once the headings are actually in the DOM.
  useEffect(() => {
    if (ready) onTocRef.current?.(tocRef.current);
  }, [ready, source, rehypePlugins]);

  const openImage = useCallback((img: HTMLImageElement) => {
    const container = img.closest('.markdown');
    const all = container ? Array.from(container.querySelectorAll<HTMLImageElement>('img.md-img')) : [img];
    setZoom({ images: all.map((i) => ({ src: i.currentSrc || i.src, alt: i.alt })), index: Math.max(0, all.indexOf(img)) });
  }, []);

  const components = useMemo<Components>(
    () => ({
      pre: ({ children, ...rest }: ComponentPropsWithoutRef<'pre'>) => {
        // A fenced block arrives as <pre><code class="language-x">…</code></pre>
        const child = Array.isArray(children) ? children[0] : children;
        const className: string = (child as { props?: { className?: string } })?.props?.className ?? '';
        const lang = /language-([\w-]+)/.exec(className)?.[1]?.toLowerCase();
        const code = textContent((child as { props?: { children?: ReactNode } })?.props?.children).replace(/\n$/, '');
        if (lang && fenceRenderers[lang]) return <>{fenceRenderers[lang](code)}</>;
        return (
          <div className="md-code">
            {lang && <span className="md-code-lang">{lang}</span>}
            <CopyButton text={code} />
            <pre {...rest}>{children}</pre>
          </div>
        );
      },
      img: ({ src, alt, ...rest }: ComponentPropsWithoutRef<'img'>) => (
        <img
          {...rest}
          src={src}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          className="md-img"
          tabIndex={0}
          role="button"
          aria-label={alt ? `放大查看：${alt}` : '放大查看图片'}
          onClick={(e) => openImage(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openImage(e.currentTarget);
            }
          }}
          onError={(e) => e.currentTarget.classList.add('is-broken')}
        />
      ),
      a: ({ href = '', children, ...rest }: ComponentPropsWithoutRef<'a'>) => {
        const target = classifyLink(href, basePath, resolveRoute);
        if (target.kind === 'external') {
          return (
            <a {...rest} href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        }
        if (target.kind === 'file') {
          return (
            <a {...rest} href={target.href}>
              {children}
            </a>
          );
        }
        // anchors and in-app routes must not touch location.hash directly (it carries the route in hash mode)
        return (
          <a
            {...rest}
            href={target.kind === 'route' ? routeHref(target.to) : href}
            onClick={(e) => {
              e.preventDefault();
              if (target.kind === 'route') navigate(target.to);
              else document.getElementById(target.id)?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            {children}
          </a>
        );
      },
      table: ({ children, ...rest }: ComponentPropsWithoutRef<'table'>) => (
        <div className="md-table">
          <table {...rest}>{children}</table>
        </div>
      ),
    }),
    [openImage, basePath, resolveRoute, navigate],
  );

  if (!ready) return <Loading label="正在准备公式渲染" />;

  return (
    <>
      <div className="markdown">
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
          {source}
        </ReactMarkdown>
      </div>
      {zoom && (
        <Lightbox images={zoom.images} index={zoom.index} onClose={() => setZoom(null)} onIndexChange={(index) => setZoom((z) => (z ? { ...z, index } : z))} />
      )}
    </>
  );
});
