import DOMPurify from 'dompurify';
import { useMemo } from 'react';

/** ```svg fenced blocks are rendered as pictures (sanitised with DOMPurify's SVG profile). */
export function SvgBlock({ code }: { code: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(code, { USE_PROFILES: { svg: true, svgFilters: true } }), [code]);
  if (!clean.trim()) {
    return (
      <pre>
        <code>{code}</code>
      </pre>
    );
  }
  return <figure className="md-svg" dangerouslySetInnerHTML={{ __html: clean }} />;
}
