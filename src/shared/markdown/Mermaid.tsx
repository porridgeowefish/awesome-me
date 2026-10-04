import { interfaceText } from '@/shared/content/interface';
import { useEffect, useId, useState } from 'react';
import { useCurrentTheme } from '@/shared/hooks/useTheme';

type MermaidApi = typeof import('mermaid').default;
let mermaidPromise: Promise<MermaidApi> | null = null;

/** Lazy-load mermaid (≈ 1 MB) only when an article actually contains a diagram. */
function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then((m) => m.default);
  return mermaidPromise;
}

const cache = new Map<string, string>();

export function MermaidBlock({ code }: { code: string }) {
  const theme = useCurrentTheme();
  const rawId = useId();
  const [svg, setSvg] = useState<string | null>(() => cache.get(theme + code) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = theme + code;
    if (cache.has(key)) {
      setSvg(cache.get(key)!);
      return;
    }
    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'dark' ? 'dark' : 'neutral',
          fontFamily: 'inherit',
        });
        const id = `mmd-${rawId.replace(/[^a-zA-Z0-9]/g, '')}-${theme}`;
        const { svg } = await mermaid.render(id, code);
        cache.set(key, svg);
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      })
      .catch((err: Error) => {
        document.querySelectorAll(`[id^="dmmd-"]`).forEach((n) => n.remove()); // mermaid leaves error nodes behind
        if (!cancelled) setError(err.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [code, theme, rawId]);

  if (error) {
    return (
      <figure className="md-diagram md-diagram-error">
        <figcaption>{interfaceText("Mermaid 图渲染失败：")}{error.split('\n')[0]}</figcaption>
        <pre>
          <code>{code}</code>
        </pre>
      </figure>
    );
  }
  if (!svg) return <figure className="md-diagram md-diagram-loading" aria-busy="true" />;
  // mermaid output is generated with securityLevel 'strict' (sanitised by mermaid itself)
  return <figure className="md-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
