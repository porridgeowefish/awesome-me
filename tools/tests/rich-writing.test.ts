import { describe, expect, it } from 'vitest';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Mathematics from '@tiptap/extension-mathematics';
import { TableKit } from '@tiptap/extension-table';

describe('rich article Markdown interoperability', () => {
  it('preserves editable formulas, images, formatting and fenced code through parse/serialize', () => {
    const manager = new MarkdownManager({ extensions: [StarterKit, Image, Mathematics, TableKit] });
    const markdown = '# 记录\n\n**粗体**与$x^2$。\n\n$$\nE=mc^2\n$$\n\n![照片](/api/v1/media/test/large)\n\n```mermaid\ngraph LR\nA-->B\n```';
    const document = manager.parse(markdown);
    expect(JSON.stringify(document)).toContain('inlineMath');
    expect(JSON.stringify(document)).toContain('blockMath');
    const saved = manager.serialize(document);
    expect(saved).toContain('$x^2$');
    expect(saved).toContain('$$\nE=mc^2\n$$');
    expect(saved).toContain('![照片](/api/v1/media/test/large)');
    expect(saved).toContain('**粗体**');
    expect(saved).toContain('```mermaid\ngraph LR\nA-->B\n```');
  });
});
