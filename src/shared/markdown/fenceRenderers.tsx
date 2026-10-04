import type { ReactNode } from 'react';
import { MermaidBlock } from './Mermaid';
import { SvgBlock } from './SvgBlock';

/**
 * Fenced code blocks whose language should render as something other than code.
 * To support a new one (e.g. ```chart), add an entry here — the renderer picks it up.
 */
export const fenceRenderers: Record<string, (code: string) => ReactNode> = {
  mermaid: (code) => <MermaidBlock code={code} />,
  svg: (code) => <SvgBlock code={code} />,
};
