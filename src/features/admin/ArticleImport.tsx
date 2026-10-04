import { useState } from 'react';
import type { ResourceData } from '../../contracts/content';
import { api, ApiError, uploadFile } from './api';
import './article-composer.css';
interface ImportResult { data: ResourceData<'essays'>; images: string[]; warnings: string[] }
export function ArticleImport({ onImport, onDirty, onBusyChange }: { onImport: (data: ResourceData<'essays'>) => void; onDirty: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void }) {
  const [source, setSource] = useState(''), [filename, setFilename] = useState('article.md');
  const [result, setResult] = useState<ImportResult | null>(null), [files, setFiles] = useState<Record<string, File>>({});
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function inspect(text = source, name = filename) {
    setBusy(true); onBusyChange(true); setMessage('');
    try { setResult(await api<ImportResult>('/api/v1/admin/essay-import', { method: 'POST', body: { source: text, filename: name } })); }
    catch (error) { setMessage(error instanceof ApiError && error.fields?.length ? error.fields.map(field => `${field.path}：${field.message}`).join('\n') : (error as Error).message); setResult(null); }
    finally { setBusy(false); onBusyChange(false); }
  }
  async function read(file: File) {
    if (file.size > 1_500_000) { setMessage('Markdown 文档不能超过 1.5 MB。'); return; }
    const text = await file.text(); setSource(text); setFilename(file.name); setFiles({}); onDirty(true); await inspect(text, file.name);
  }
  async function importArticle() {
    if (!result || result.images.some(path => !files[path])) return;
    setBusy(true); onBusyChange(true); setMessage('正在保存文档图片…');
    try {
      const replacements: Record<string, string> = {};
      for (const path of result.images) { const asset = await uploadFile(files[path], 'essay'); replacements[path] = asset.variants.large ?? asset.variants.original; }
      const next = await api<ImportResult>('/api/v1/admin/essay-import', { method: 'POST', body: { source, filename, replacements } });
      if (next.images.length) throw new Error('仍有未配置的图片路径，请重新检查。');
      onDirty(false); onBusyChange(false); onImport(next.data);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); onBusyChange(false); }
  }
  return <section className="article-import admin-settings-card"><span className="eyebrow">FROM YOUR NOTEBOOK</span><h2>导入 Markdown</h2><p>上传 .md 文档，在下方调整 YAML 头和正文，再为本地图片选择文件。导入后会打开草稿编辑器。</p><label className="btn">选择 Markdown 文档<input hidden type="file" disabled={busy} accept=".md,.markdown,text/markdown" onChange={event => { const file = event.target.files?.[0]; if (file) void read(file); event.target.value = ''; }}/></label>
    {!source && <pre className="article-yaml-example">{'---\ntitle: 我的新文章\npublicPath: 随笔/我的新文章\ndate: 2026-10-03\ntags: [生活, 记录]\nsummary: 一句话介绍\n---\n正文从这里开始…'}</pre>}
    {source && <><label>YAML 头与 Markdown 正文<textarea className="article-import-source" value={source} disabled={busy} spellCheck={false} onChange={event => { setSource(event.target.value); setResult(null); onDirty(true); }}/></label><button className="btn" disabled={busy} onClick={() => void inspect()}>检查文档与图片路径</button></>}
    {result && <div className="article-import-review"><h3>{result.data.title}</h3><p className="muted">{result.data.publicPath} · {result.data.date} · 将保存为草稿</p>{result.images.length ? <><h4>配置本地图片</h4>{result.images.map(path => <label className="article-image-mapping" key={path}><code>{path}</code><input type="file" accept="image/*" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) setFiles(previous => ({ ...previous, [path]: file })); }}/></label>)}</> : <p>图片路径已准备好。</p>}{result.warnings.map(warning => <p className="muted" key={warning}>{warning}</p>)}<button className="btn btn-primary" disabled={busy || result.images.some(path => !files[path])} onClick={() => void importArticle()}>{busy ? '正在导入…' : '导入并打开草稿 →'}</button></div>}
    {message && <p className="admin-notice" role="status">{message}</p>}
  </section>;
}
