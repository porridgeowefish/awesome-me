import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { essaySchema, type ContentRecord, type ResourceData } from '../../contracts/content';
import type { EssayWorkingDraft } from '../../contracts/essay-draft';
import { emptyResource } from '../../contracts/editor';
import { api, ApiError, uploadFile } from './api';
import { refreshSiteContent } from '@/shared/content/runtime';
import { refreshAfterSave } from './saveRefresh';
import './article-composer.css';
const RichArticleEditor = lazy(() => import('./RichArticleEditor').then(module => ({ default: module.RichArticleEditor })));
const Preview = lazy(() => import('@/shared/markdown/MarkdownRenderer').then(module => ({ default: module.MarkdownRenderer })));
type Essay = ResourceData<'essays'>;
interface Recovery { data: Essay; row: ContentRecord<'essays'> | null; draftRevision: number; baseline: string }
function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function newEssay() { const data = emptyResource('essays') as Essay; const date = localDate(); return { ...data, date, publicPath: `notes/${date}-${crypto.randomUUID().slice(0, 8)}`, folder: ['notes'] }; }
function normalized(data: Essay): Essay { return essaySchema.parse({ ...data, title: data.title.trim() || '未命名文章', folder: data.publicPath.split('/').slice(0, -1), status: 'draft' }); }
export function ArticleComposer({ record, initialData, onSaved, onDraftSaved, onDirty, onBusyChange }: {
  record: ContentRecord | null; initialData?: Essay; onSaved: (record: ContentRecord, warning?: string) => void;
  onDraftSaved: (record: ContentRecord) => void; onDirty: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [data, setData] = useState<Essay>(() => initialData ?? record?.data as Essay ?? newEssay());
  const [baseline, setBaseline] = useState(JSON.stringify(data));
  const [tagText, setTagText] = useState(data.tags.join(', '));
  const [mode, setMode] = useState<'rich' | 'markdown'>(initialData || record ? 'markdown' : 'rich');
  const [preview, setPreview] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [mediaBusy, setMediaBusy] = useState(false);
  const [message, setMessage] = useState(''), [saveState, setSaveState] = useState('自动保存已开启'), [conflict, setConflict] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const failedSnapshot = useRef('');
  const rowRef = useRef(record as ContentRecord<'essays'> | null), draftRevision = useRef(0), saving = useRef(false), latest = useRef(data), alive = useRef(true), composing = useRef(false);
  latest.current = data;
  const key = `site:article-recovery:${record?.id ?? 'new'}`;
  const dirty = JSON.stringify(data) !== baseline;
  const guarded = dirty || mediaBusy || busy;
  const blocker = useBlocker(guarded);
  const callbacks = useRef({ onSaved, onDraftSaved, onDirty, onBusyChange }); callbacks.current = { onSaved, onDraftSaved, onDirty, onBusyChange };
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        let cached: Recovery | null = null;
        try { cached = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Recovery | null; } catch { /* Storage may be unavailable. */ }
        const row = cached?.row && !record ? await api<ContentRecord<'essays'>>(`/api/v1/admin/essays/${encodeURIComponent(cached.row.id)}`) : record as ContentRecord<'essays'> | null;
        let draft: EssayWorkingDraft | null = null;
        if (row?.data.status === 'published') draft = await api<EssayWorkingDraft | null>(`/api/v1/admin/essays/${encodeURIComponent(row.id)}/draft`);
        if (!alive.current) return;
        rowRef.current = row; draftRevision.current = draft?.revision ?? 0;
        const serverData = draft?.data ?? row?.data ?? initialData ?? latest.current;
        const serverBaseline = JSON.stringify(serverData);
        setBaseline(initialData && !row ? '' : serverBaseline);
        if (cached && essaySchema.safeParse({ ...cached.data, title: cached.data.title || '未命名文章', folder: cached.data.publicPath.split('/').slice(0, -1) }).success) {
          setData(cached.data); setTagText(cached.data.tags.join(', ')); setMessage('已恢复浏览器中尚未保存的编辑。');
          if ((cached.row?.revision ?? 0) !== (row?.revision ?? 0) || cached.draftRevision !== (draft?.revision ?? 0)) { setConflict(true); setMessage('已恢复本地编辑，但服务器版本已变化。请复制需要保留的内容，返回列表重新打开并核对。'); }
        } else { setData(serverData); setTagText(serverData.tags.join(', ')); if (draft) setMessage('已继续编辑上次自动保存的草稿；公开文章尚未改变。'); }
        if (draft && draft.baseRevision !== row?.revision) { setConflict(true); setMessage('这份草稿的公开正文已在其他页面修改。请复制需要保留的内容，重新打开文章后核对。'); }
      } catch (error) { if (alive.current) { setMessage((error as Error).message); setConflict(true); } }
      finally { if (alive.current) setReady(true); }
    })();
    return () => { alive.current = false; };
  }, [key, record, initialData]);
  const stash = useCallback(() => {
    if (!ready || !dirty) return;
    try { sessionStorage.setItem(key, JSON.stringify({ data: latest.current, row: rowRef.current, draftRevision: draftRevision.current, baseline } satisfies Recovery)); }
    catch { setSaveState('浏览器恢复副本未能保存，请手动保存草稿'); }
  }, [ready, dirty, key, baseline]);
  useEffect(() => { stash(); }, [data, stash]);
  useEffect(() => {
    callbacks.current.onDirty(guarded); callbacks.current.onBusyChange(busy || mediaBusy);
    const leave = (event: BeforeUnloadEvent) => { if (guarded) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    return () => { window.removeEventListener('beforeunload', leave); callbacks.current.onDirty(false); callbacks.current.onBusyChange(false); };
  }, [guarded, busy, mediaBusy]);
  async function persist(publish = false) {
    if (!ready || conflict || saving.current || mediaBusy || composing.current) return;
    if (publish && (!latest.current.title.trim() || !latest.current.body.trim())) { setMessage('发布前请填写标题和正文。'); return; }
    saving.current = true; setBusy(true); setPublishing(publish); setSaveState('正在保存…'); setMessage('');
    try {
      const input = normalized(latest.current);
      const sourceSnapshot = JSON.stringify(latest.current);
      let row = rowRef.current;
      if (row?.data.status === 'published') {
        const draft = await api<EssayWorkingDraft>(`/api/v1/admin/essays/${encodeURIComponent(row.id)}/draft`, { method: 'PUT', body: { data: input, baseRevision: row.revision, revision: draftRevision.current } });
        draftRevision.current = draft.revision;
        if (publish) {
          row = await api<ContentRecord<'essays'>>(`/api/v1/admin/essays/${encodeURIComponent(row.id)}/draft/publish`, { method: 'POST', body: { baseRevision: row.revision, revision: draft.revision } });
          rowRef.current = row; draftRevision.current = 0;
        }
      } else {
        row = await api<ContentRecord<'essays'>>(`/api/v1/admin/essays${row ? `/${encodeURIComponent(row.id)}` : ''}`, { method: row ? 'PUT' : 'POST', body: { data: { ...input, status: publish ? 'published' : 'draft' }, ...(row ? { revision: row.revision } : {}) } });
        rowRef.current = row; callbacks.current.onDraftSaved(row);
      }
      if (!alive.current) return;
      setBaseline(sourceSnapshot); setSaveState(`草稿已保存 · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      if (JSON.stringify(latest.current) === sourceSnapshot) { try { sessionStorage.removeItem(key); } catch { /* Server acknowledged the save. */ } }
      else { try { sessionStorage.setItem(key, JSON.stringify({ data: latest.current, row: rowRef.current, draftRevision: draftRevision.current, baseline: sourceSnapshot } satisfies Recovery)); } catch { /* Leave guard remains active. */ } }
      if (publish && row) {
        const warning = await refreshAfterSave(refreshSiteContent);
        callbacks.current.onSaved(row, warning);
      }
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof ApiError && error.status === 409) setConflict(true);
      failedSnapshot.current = JSON.stringify(latest.current);
      setSaveState('未保存 · 编辑仍保留在此页面'); setMessage(error instanceof ApiError && error.fields?.length ? error.fields.map(field => `${field.path}：${field.message}`).join('\n') : (error as Error).message); stash();
    } finally { saving.current = false; if (alive.current) { setBusy(false); setPublishing(false); } }
  }
  const persistRef = useRef(persist); persistRef.current = persist;
  useEffect(() => {
    if (!ready || !dirty || busy || mediaBusy || conflict || failedSnapshot.current === JSON.stringify(data)) return;
    setSaveState('等待自动保存…');
    const timer = window.setTimeout(() => { void persistRef.current(); }, 1600);
    return () => window.clearTimeout(timer);
  }, [data, dirty, ready, busy, mediaBusy, conflict]);
  const change = <K extends keyof Essay>(field: K, value: Essay[K]) => setData(previous => ({ ...previous, [field]: value }));
  async function uploadCover(file: File) {
    setMediaBusy(true);
    try { const asset = await uploadFile(file, 'cover'); change('cover', asset.variants.large ?? asset.variants.original); }
    catch (error) { setMessage((error as Error).message); } finally { setMediaBusy(false); }
  }
  async function discardAndReload() {
    const id = rowRef.current?.id;
    if (!window.confirm('舍弃当前编辑和这篇文章的工作草稿，重新读取最新正文？可先复制需要保留的内容。')) return;
    setBusy(true);
    try {
      let fresh: ContentRecord<'essays'> | null = null;
      if (id) {
        fresh = await api<ContentRecord<'essays'>>(`/api/v1/admin/essays/${encodeURIComponent(id)}`);
        const draft = await api<EssayWorkingDraft | null>(`/api/v1/admin/essays/${encodeURIComponent(id)}/draft`);
        if (draft) await api(`/api/v1/admin/essays/${encodeURIComponent(id)}/draft`, { method: 'DELETE', body: { baseRevision: fresh.revision, revision: draft.revision } });
      }
      const next = fresh?.data ?? newEssay(); rowRef.current = fresh; draftRevision.current = 0;
      setData(next); setTagText(next.tags.join(', ')); setBaseline(JSON.stringify(next)); setMode('markdown'); setPreview(false); setConflict(false); failedSnapshot.current = '';
      try { sessionStorage.removeItem(key); } catch { /* Recovered data has been explicitly discarded. */ }
      setMessage('已读取服务器最新正文。'); setSaveState('自动保存已开启');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  if (!ready) return <p role="status">正在读取文章草稿…</p>;
  return <section className="article-composer" aria-label="文章写作" onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}>
    <header className="article-compose-header"><div><span className="eyebrow">A LETTER TO THE WORLD</span><h2>{rowRef.current?.data.status === 'published' ? '继续写，准备下一次更新' : '写下此刻的想法'}</h2><span className="article-save-status" role="status">{saveState}</span></div><div className="admin-actions"><button className="btn" disabled={busy || mediaBusy} onClick={() => setPreview(value => !value)}>{preview ? '回到撰写' : '预览'}</button><button className="btn" disabled={busy || mediaBusy || conflict} onClick={() => void persist()}>保存草稿</button><button className="btn btn-primary" disabled={busy || mediaBusy || conflict} onClick={() => void persist(true)}>{rowRef.current?.data.status === 'published' ? '发布更新 ↗' : '发布文章 ↗'}</button></div></header>
    {message && <p className="admin-notice" role="status">{message}</p>}
    {conflict && <div className="article-insert-panel"><p>当前编辑已保留。请先复制需要保留的正文，再重新读取服务器版本并手动合并。</p><div className="admin-actions"><button className="btn" onClick={() => { void navigator.clipboard.writeText(data.body).then(() => setMessage('正文已复制。')).catch(() => setMessage('复制未成功，可切换到 Markdown 手动复制正文。')); }}>复制当前正文</button><button className="btn" disabled={busy} onClick={() => void discardAndReload()}>舍弃草稿，读取最新正文</button></div></div>}
    <fieldset disabled={publishing} className="article-compose-fields"><label className="article-title-label">标题<input className="article-title-input" aria-label="文章标题" placeholder="给这个想法起个名字" value={data.title} onChange={event => change('title', event.target.value)}/></label>
      <label className="article-subtitle-label">副标题<input placeholder="一句补充，也可以留白" value={data.subtitle} onChange={event => change('subtitle', event.target.value)}/></label>
      <div className="article-mode-row"><div className="article-mode-tabs" role="group" aria-label="编辑方式"><button type="button" className={mode === 'rich' ? 'is-active' : ''} disabled={mediaBusy} onClick={() => setMode('rich')}>富文本</button><button type="button" className={mode === 'markdown' ? 'is-active' : ''} disabled={mediaBusy} onClick={() => setMode('markdown')}>Markdown</button></div><span className="muted">{mediaBusy ? '图片正在保存…' : `${data.body.length.toLocaleString()} 字符 · 自动存为草稿`}</span></div>
      {preview ? <article className="article-prose-preview"><h1>{data.title}</h1><Suspense fallback={<p>正在准备预览…</p>}><Preview source={data.body} needsMath basePath={`content/essays/${data.publicPath}/index.md`}/></Suspense></article> : mode === 'rich' ? <Suspense fallback={<p>正在准备富文本编辑器…</p>}><RichArticleEditor body={data.body} onChange={value => change('body', value)} onBusyChange={setMediaBusy} disabled={publishing}/></Suspense> : <><textarea className="article-markdown-source" aria-label="Markdown 正文" value={data.body} onChange={event => change('body', event.target.value)} spellCheck={false}/><p className="article-source-hint">导入与已有文章保留 Markdown 原文。富文本适合常规写作；Mermaid、SVG 等扩展内容可在这里编辑和预览。</p></>}
      <details className="article-settings"><summary>文章设置 <span>分类、标签、封面与摘要</span></summary><div className="admin-grid"><label>文章路径<input value={data.publicPath} onChange={event => change('publicPath', event.target.value)} placeholder="分类/文章名"/><small>分类由路径自动生成；新文章已分配独立路径。</small></label><label>日期<input type="date" value={data.date} onChange={event => change('date', event.target.value)}/></label><label>标签（逗号分隔）<input value={tagText} onChange={event => { setTagText(event.target.value); change('tags', event.target.value.split(/[,，]/).map(value => value.trim()).filter(Boolean)); }}/></label><label>封面地址<input value={data.cover ?? ''} onChange={event => change('cover', event.target.value)}/></label></div><label>摘要<textarea value={data.summary} onChange={event => change('summary', event.target.value)}/></label><div className="admin-actions"><label className="btn">上传封面<input hidden disabled={mediaBusy} type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadCover(file); event.target.value = ''; }}/></label><label className="admin-check"><input type="checkbox" checked={data.featured} onChange={event => change('featured', event.target.checked)}/>推荐文章</label></div></details>
    </fieldset>
    {blocker.state === 'blocked' && <div className="admin-dialog" role="alertdialog" aria-label="文章尚未保存"><div><h3>{busy || mediaBusy ? '正在保存，请稍候' : '还有未保存的编辑'}</h3><p>{busy || mediaBusy ? '图片和草稿处理完成后即可离开。' : '继续编辑并保存，或保留浏览器恢复副本后离开。'}</p><button className="btn" onClick={() => blocker.reset()}>继续编辑</button>{!busy && !mediaBusy && <button className="btn" onClick={() => { stash(); blocker.proceed(); }}>保留恢复副本并离开</button>}</div></div>}
  </section>;
}
