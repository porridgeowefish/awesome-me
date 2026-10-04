import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Mathematics from '@tiptap/extension-mathematics';
import Placeholder from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import { Markdown } from '@tiptap/markdown';
import { uploadFile } from './api';
import 'katex/dist/katex.min.css';

interface Props { body: string; onChange: (body: string) => void; onBusyChange: (busy: boolean) => void; disabled?: boolean }
export function RichArticleEditor({ body, onChange, onBusyChange, disabled = false }: Props) {
  const callbacks = useRef({ onChange, onBusyChange }); callbacks.current = { onChange, onBusyChange };
  const pending = useRef(0), alive = useRef(true), uploadInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState(''), [panel, setPanel] = useState<'math' | 'link' | null>(null);
  const [latex, setLatex] = useState(''), [blockMath, setBlockMath] = useState(true), [link, setLink] = useState('');
  const [mathPosition, setMathPosition] = useState<number | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, protocols: ['http', 'https', 'mailto'] } }),
      Image, TableKit, Markdown, Placeholder.configure({ placeholder: '从一个想法开始…也可以直接粘贴图片。' }),
      Mathematics.configure({ katexOptions: { throwOnError: false, trust: false },
        inlineOptions: { onClick: (node, pos) => { setLatex(node.attrs.latex); setBlockMath(false); setMathPosition(pos); setPanel('math'); } },
        blockOptions: { onClick: (node, pos) => { setLatex(node.attrs.latex); setBlockMath(true); setMathPosition(pos); setPanel('math'); } },
      }),
    ],
    content: body, contentType: 'markdown', shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => callbacks.current.onChange(editor.getMarkdown()),
    editorProps: {
      attributes: { class: 'article-prose', 'aria-label': '文章正文', role: 'textbox', 'aria-multiline': 'true' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.items ?? []).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file);
        if (!files.length) return false;
        event.preventDefault(); void uploadImages(files); return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter(file => file.type.startsWith('image/'));
        if (!files.length) return false;
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (position) editor?.commands.setTextSelection(position.pos);
        void uploadImages(files); return true;
      },
    },
  });
  useEffect(() => { editor?.setEditable(!disabled); }, [editor, disabled]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function uploadImages(files: File[]) {
    if (!editor || disabled) return;
    pending.current++; callbacks.current.onBusyChange(true); setMessage('正在保存图片…');
    try {
      for (const file of files) {
        const preview = URL.createObjectURL(file);
        editor.chain().focus().setImage({ src: preview, alt: file.name }).run();
        try {
          const asset = await uploadFile(file, 'essay');
          if (!editor.isDestroyed) {
            const tr = editor.state.tr;
            editor.state.doc.descendants((node, pos) => { if (node.type.name === 'image' && node.attrs.src === preview) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: asset.variants.large ?? asset.variants.original }); });
            editor.view.dispatch(tr);
          }
          if (alive.current) setMessage(`图片已保存 · ${asset.filename}`);
        } catch (error) {
          if (!editor.isDestroyed) {
            const positions: { pos: number; size: number }[] = [];
            editor.state.doc.descendants((node, pos) => { if (node.type.name === 'image' && node.attrs.src === preview) positions.push({ pos, size: node.nodeSize }); });
            const tr = editor.state.tr; positions.reverse().forEach(({ pos, size }) => tr.delete(pos, pos + size)); editor.view.dispatch(tr);
          }
          throw error;
        } finally { URL.revokeObjectURL(preview); }
      }
    } catch (error) { if (alive.current) setMessage(`图片未能保存，请重新粘贴或上传：${(error as Error).message}`); }
    finally { pending.current--; callbacks.current.onBusyChange(pending.current > 0); }
  }
  if (!editor) return <p>正在准备编辑器…</p>;
  const tool = (label: string, text: string, action: () => void, active?: boolean) => <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled} className={active ? 'is-active' : ''} onMouseDown={event => event.preventDefault()} onClick={action}>{text}</button>;
  return <div className="article-rich-editor">
    <div className="article-toolbar" role="toolbar" aria-label="正文格式">
      {tool('粗体', 'B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {tool('斜体', 'I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {tool('二级标题', 'H₂', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
      {tool('三级标题', 'H₃', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }))}
      <span className="article-tool-divider"/>
      {tool('无序列表', '• 列表', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
      {tool('有序列表', '1. 列表', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
      {tool('引用', '❞', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'))}
      {tool('代码块', '</>', () => editor.chain().focus().toggleCodeBlock().run(), editor.isActive('codeBlock'))}
      {tool('插入表格', '表格', () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      {editor.isActive('table') && tool('删除表格', '删表', () => editor.chain().focus().deleteTable().run())}
      <span className="article-tool-divider"/>
      {tool('插入链接', '链接', () => { setLink(editor.getAttributes('link').href ?? ''); setPanel('link'); })}
      {tool('插入图片', '图片', () => uploadInput.current?.click())}
      {tool('插入公式', '∑ 公式', () => { setMathPosition(null); setLatex(''); setPanel('math'); })}
      <span className="article-tool-divider"/>
      {tool('撤销', '↶', () => editor.chain().focus().undo().run())}{tool('重做', '↷', () => editor.chain().focus().redo().run())}
    </div>
    <input hidden ref={uploadInput} type="file" accept="image/*" multiple onChange={event => { void uploadImages(Array.from(event.target.files ?? [])); event.target.value = ''; }}/>
    {panel && <div className="article-insert-panel">
      {panel === 'math' ? <><label>LaTeX 公式<textarea value={latex} onChange={event => setLatex(event.target.value)} placeholder="E = mc^2"/></label><label className="admin-check"><input type="checkbox" checked={blockMath} disabled={mathPosition !== null} onChange={event => setBlockMath(event.target.checked)}/>独立一行显示</label></> : <label>链接地址<input type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="https://"/></label>}
      <div className="admin-actions"><button className="btn btn-primary" disabled={disabled || (panel === 'math' ? !latex.trim() : !/^(https?:\/\/|mailto:)/i.test(link))} onClick={() => {
        if (panel === 'math') {
          if (mathPosition !== null) {
            const node = editor.state.doc.nodeAt(mathPosition);
            if (node?.type.name === (blockMath ? 'blockMath' : 'inlineMath')) { const chain = editor.chain().focus().setNodeSelection(mathPosition); (blockMath ? chain.updateBlockMath({ latex }) : chain.updateInlineMath({ latex })).run(); }
          } else { const chain = editor.chain().focus(); (blockMath ? chain.insertBlockMath({ latex }) : chain.insertInlineMath({ latex })).run(); }
        } else editor.chain().focus().extendMarkRange('link').setLink({ href: link }).run();
        setPanel(null);
      }}>确认</button>{panel === 'link' && <button className="btn" onClick={() => { editor.chain().focus().unsetLink().run(); setPanel(null); }}>移除链接</button>}<button className="btn" onClick={() => { setPanel(null); editor.commands.focus(); }}>取消</button></div>
    </div>}
    {message && <p className="article-upload-status" role="status">{message}</p>}
    <EditorContent editor={editor}/>
  </div>;
}
