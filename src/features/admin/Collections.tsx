import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { NavLink, useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SINGLETON_KINDS, type ContentRecord, type ResourceKind } from '../../contracts/content';
import { RESOURCE_LABELS } from '../../contracts/editor';
import { api, uploadFile } from './api';
import { ResourceEditor } from './ResourceEditor';
import { CollectionDetails } from './CollectionDetails';
import { cellText, collectionAssetUrl, collectionColumns, collectionPage, isRecordPublic, mergeSavedRecord, recordStatus, recordTitle, reorderedRecords, COLLECTION_PAGE_SIZE, type PublicationFilter } from './collectionModel';
import { refreshSiteContent } from '@/shared/content/runtime';
import { ArticleComposer } from './ArticleComposer';
import { ArticleImport } from './ArticleImport';
import type { ResourceData } from '../../contracts/content';

export async function loadCollection(kind: ResourceKind): Promise<ContentRecord[]> {
  const all: ContentRecord[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const page = await api<{ items: ContentRecord[]; total: number }>(`/api/v1/admin/${kind}?limit=1000&offset=${offset}`);
    all.push(...page.items);
    if (all.length >= page.total) return all;
  }
  return all;
}

/** Mount only while the editor, which owns its own router blocker, is closed. */
function CollectionBusyGuard({ busy, dirty = false }: { busy: boolean; dirty?: boolean }) {
  const guarded = busy || dirty;
  const blocker = useBlocker(guarded);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (guarded) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [guarded]);
  return blocker.state === 'blocked' ? <div className="admin-dialog" role="alertdialog" aria-label="尚未完成的内容"><div><h3>{busy ? '正在处理，请稍候' : '导入还未完成'}</h3><p>{busy ? '等待上传或保存完成后再离开。' : '离开将舍弃这次尚未导入的文档。'}</p><button className="btn" onClick={() => blocker.reset()}>继续处理</button>{!busy && <button className="btn" onClick={() => blocker.proceed()}>舍弃并离开</button>}</div></div> : null;
}

export function CollectionManager({ kind }: { kind: ResourceKind }) {
  const location = useLocation();
  const navigationNotice = typeof location.state?.saveNotice === 'string' ? location.state.saveNotice : '';
  const [items, setItems] = useState<ContentRecord[]>([]);
  const [selected, setSelected] = useState<ContentRecord | null>(null);
  const [mode, setMode] = useState<'browse' | 'detail' | 'edit' | 'import'>('browse');
  const [articleInitial, setArticleInitial] = useState<ResourceData<'essays'> | undefined>();
  const [newEditorVersion, setNewEditorVersion] = useState(0);
  const [query, setQuery] = useState(''), [status, setStatus] = useState<PublicationFilter>('all'), [page, setPage] = useState(0);
  const [message, setMessage] = useState(navigationNotice), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [editorBusy, setEditorBusy] = useState(false);
  const [loading, setLoading] = useState(true), [deleting, setDeleting] = useState<ContentRecord | null>(null), [preview, setPreview] = useState(false);
  const [footprints, setFootprints] = useState<ContentRecord<'footprints'>[]>([]), [bulkFootprint, setBulkFootprint] = useState('__auto__');
  useEffect(() => {
    if (kind !== 'gallery') return;
    let alive = true;
    void loadCollection('footprints').then(rows => { if (alive) setFootprints(rows as ContentRecord<'footprints'>[]); }).catch(error => { if (alive) setMessage(`地区列表未能加载：${(error as Error).message}`); });
    return () => { alive = false; };
  }, [kind]);
  const [params, setParams] = useSearchParams(), navigate = useNavigate();
  const focusPath = params.get('field') ?? undefined, requestedId = params.get('id');
  const singleton = SINGLETON_KINDS.has(kind);
  const load = useCallback(async () => { const all = await loadCollection(kind); setItems(all); return all; }, [kind]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadCollection(kind).then(all => {
      if (!alive) return;
      setItems(all);
      const row = all.find(item => item.id === requestedId) ?? (singleton ? all[0] : undefined);
      setSelected(row ?? null);
      setMode(singleton || row && (requestedId || focusPath) ? 'edit' : 'browse');
      if (requestedId && !row) setMessage('这条内容不存在，或已经删除。');
    }).catch(error => { if (alive) setMessage(navigationNotice ? `${navigationNotice}\n内容列表暂时未能刷新：${(error as Error).message}` : (error as Error).message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kind, singleton, requestedId, focusPath, navigationNotice]);

  const canLeaveEditor = () => !busy && !editorBusy && (!dirty || window.confirm('当前修改尚未保存，是否放弃修改？'));
  const create = () => {
    if (!canLeaveEditor()) return;
    setArticleInitial(undefined);
    setSelected(null); setMode('edit'); setNewEditorVersion(value => value + 1); setDirty(false); setMessage('');
  };
  const startImport = () => {
    if (!canLeaveEditor()) return;
    setSelected(null); setMode('import'); setDirty(false); setMessage('');
  };
  const closePanel = () => {
    if (!canLeaveEditor()) return;
    // Remove the editor and its dirty blocker before clearing a preview deep link.
    flushSync(() => { setMode('browse'); setSelected(null); setDirty(false); });
    if (requestedId || focusPath) setParams({}, { replace: true });
  };
  const onSaved = async (row: ContentRecord, warning?: string) => {
    const notice = warning ?? '已保存。公开页面会读取最新内容。';
    if (row.kind !== kind) { navigate(`/admin/${row.kind}?id=${encodeURIComponent(row.id)}`, { state: { saveNotice: notice } }); return; }
    setItems(current => mergeSavedRecord(current, row));
    setSelected(row); setMode(singleton ? 'edit' : 'detail'); setDirty(false);
    setMessage(notice);
    try { await load(); } catch (error) { setMessage(`${notice}\n内容列表暂时未能刷新：${(error as Error).message}`); }
  };
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await api(`/api/v1/admin/${kind}/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', body: { revision: deleting.revision } });
      if (selected?.id === deleting.id) { setSelected(null); setMode('browse'); }
      setDeleting(null); await load(); await refreshSiteContent(); setMessage('已删除。');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function move(row: ContentRecord, delta: number) {
    if (busy || dirty) return;
    const next = reorderedRecords(items, row.id, delta);
    if (!next) return;
    setBusy(true);
    try {
      await api(`/api/v1/admin/${kind}/reorder`, { method: 'POST', body: { ids: next.map(item => item.id), revisions: Object.fromEntries(items.map(item => [item.id, item.revision])) } });
      await load(); await refreshSiteContent();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function bulk(files: FileList) {
    if (busy) return;
    setBusy(true);
    const reports: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          const asset = await uploadFile(file, kind === 'gallery' ? 'gallery' : 'music');
          const title = file.name.replace(/\.[^.]+$/, '');
          const data = kind === 'gallery' ? {
            title, src: asset.variants.large, thumb: asset.variants.thumb, place: asset.suggestedLocation?.address ?? '',
            date: asset.capturedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), story: '', visible: false,
            ...(asset.suggestedLocation ? { location: { lnglat: asset.suggestedLocation.lnglat, address: asset.suggestedLocation.address, source: 'exif' } } : {}),
            ...(bulkFootprint !== '__auto__' ? {
              footprint: bulkFootprint,
              ...(footprints.find(row => row.id === bulkFootprint) ? { place: footprints.find(row => row.id === bulkFootprint)!.data.name } : {}),
            } : {}),
          } : { title, src: asset.variants.original, artist: '', visible: false };
          await api(`/api/v1/admin/${kind}`, { method: 'POST', body: { data } });
          reports.push(`${file.name}：已添加，等待填写和公开${asset.warnings.length ? '；' + asset.warnings.join('；') : ''}`);
        } catch (error) { reports.push(`${file.name}：${(error as Error).message}`); }
        setMessage(reports.join('\n'));
      }
      await load();
      await refreshSiteContent();
      if (kind === 'gallery') setFootprints(await loadCollection('footprints') as ContentRecord<'footprints'>[]);
    } catch (error) { setMessage(`${reports.join('\n')}\n${(error as Error).message}`); } finally { setBusy(false); }
  }
  async function syncLocations() {
    setBusy(true);
    try {
      const result = await api<{ linked: number; skipped: number; errors: { id: string; message: string }[] }>('/api/v1/admin/gallery/sync-locations', { method: 'POST' });
      setMessage(`已关联 ${result.linked} 张照片；${result.skipped} 张需要补充地点或坐标。${result.errors.length ? '\n' + result.errors.map(error => `${error.id}：${error.message}`).join('\n') : ''}`);
      await load(); await refreshSiteContent();
      setFootprints(await loadCollection('footprints') as ContentRecord<'footprints'>[]);
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  const result = collectionPage(items, query, status, page), columns = collectionColumns(kind);
  const previewRoute = kind === 'gallery' ? '/gallery' : kind === 'footprints' || kind === 'wishes' ? '/footprints' : kind === 'essays' || kind === 'folders' ? '/essays' : '/';
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'site:edit-region') return;
      const target = String(event.data.region).split(':');
      if (['site', 'profile', 'gallery', 'music', 'essays', 'footprints', 'wishes', 'brands', 'folders'].includes(target[0])) navigate(`/admin/${target[0]}?field=${encodeURIComponent(target[1] ?? '')}${target[2] ? `&id=${encodeURIComponent(target[2])}` : ''}`);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [navigate]);
  const openDetails = (row: ContentRecord) => { if (busy) return; setSelected(row); setMode('detail'); setMessage(''); };
  const editing = singleton || mode === 'edit';
  const isFootprint = kind === 'footprints' || kind === 'wishes';
  const firstShown = result.page * COLLECTION_PAGE_SIZE + 1;
  const lastShown = Math.min((result.page + 1) * COLLECTION_PAGE_SIZE, result.filtered.length);

  return <><div className="admin-heading"><div><span className="eyebrow">CONTENT STUDIO</span><h1>{isFootprint ? '足迹' : RESOURCE_LABELS[kind]}</h1><p>{singleton ? '编辑后保存，网站将同步更新。' : `${items.length} 条内容 · 查看详情后，可按需编辑。`}</p></div><div className="admin-actions"><button className="btn" disabled={busy || editorBusy} onClick={() => setPreview(value => !value)}>{preview ? '关闭网站预览' : '点击网站选择控件'}</button>{!singleton && <button className="btn btn-primary" disabled={busy || editorBusy || loading} onClick={create}>＋ 新建</button>}{kind === 'essays' && <button className="btn" disabled={busy || editorBusy || loading} onClick={startImport}>导入 Markdown</button>}</div></div>
    {isFootprint && <nav className="admin-category-tabs" aria-label="足迹分类"><NavLink to="/admin/footprints" end>已去</NavLink><NavLink to="/admin/wishes" end>未来</NavLink></nav>}
    {preview && <section className="admin-live-preview"><p>在预览里点击需要编辑的区域，会打开对应的字段组。</p><iframe title="网站编辑预览" src={`/?preview=1#${previewRoute}`}/></section>}
    {message && <p className="admin-notice" role="status">{message}</p>}
    {loading ? <p className="muted" role="status">正在加载内容…</p> : mode === 'import' ? <><div className="admin-panel-header"><button className="btn" disabled={editorBusy} onClick={closePanel}>← 返回列表</button><button className="btn" disabled={editorBusy} onClick={create}>切换到新建文章</button></div><ArticleImport onImport={data => { setArticleInitial(data); setNewEditorVersion(value => value + 1); setMode('edit'); setDirty(false); }} onDirty={setDirty} onBusyChange={setEditorBusy}/></> : editing ? <section className={`admin-editor-panel ${singleton ? 'is-singleton' : ''}`} aria-label="编辑内容">{!singleton && <div className="admin-panel-header"><button className="btn" disabled={busy || editorBusy} onClick={closePanel}>← 返回列表</button><h2>{selected ? `编辑：${recordTitle(selected)}` : `新建${RESOURCE_LABELS[kind]}`}</h2></div>}{kind === 'essays' ? <ArticleComposer key={`essay:${selected?.id ?? 'new'}:${newEditorVersion}`} record={selected} initialData={articleInitial} onSaved={(row, warning) => void onSaved(row, warning)} onDraftSaved={row => setItems(current => mergeSavedRecord(current, row))} onDirty={setDirty} onBusyChange={setEditorBusy}/> : <ResourceEditor key={`${kind}:${selected?.id ?? 'new'}:${selected?.revision ?? newEditorVersion}`} kind={kind} record={selected} focusPath={focusPath} onSaved={(row, warning) => void onSaved(row, warning)} onDirty={setDirty} onBusyChange={setEditorBusy}/>}</section> : mode === 'detail' && selected ? <CollectionDetails record={selected} disabled={busy} onClose={closePanel} onEdit={() => setMode('edit')}/> : <section className="admin-collection-browser" aria-label={`${RESOURCE_LABELS[kind]}列表`}>
      <div className="admin-collection-toolbar">{kind === 'gallery' && <><label>批量上传所属地区<select value={bulkFootprint} disabled={busy} onChange={event => setBulkFootprint(event.target.value)}><option value="__auto__">根据照片地点自动关联</option><option value="">不关联足迹</option>{footprints.map(row => <option key={row.id} value={row.id}>{row.data.name} · {row.data.region}{row.data.visible ? '' : '（未公开）'}</option>)}</select></label><button className="btn" disabled={busy} onClick={() => void syncLocations()}>同步已有照片地点</button></>}<label className="admin-list-search">搜索<input type="search" placeholder="名称、地点、标签…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }}/></label><label>公开状态<select value={status} onChange={event => { setStatus(event.target.value as PublicationFilter); setPage(0); }}><option value="all">全部</option><option value="public">{kind === 'essays' ? '已发布' : '公开'}</option><option value="private">{kind === 'essays' ? '草稿' : '未公开'}</option></select></label><span className="muted">{result.filtered.length} 条结果</span>{['gallery', 'music'].includes(kind) && <label className="btn admin-bulk">{busy ? '正在上传…' : kind === 'music' ? '批量上传音乐' : '批量上传照片'}<input type="file" multiple disabled={busy} accept={kind === 'music' ? 'audio/*,video/mp4,.mp3,.mp4,.flac,.m4a' : 'image/*,.heic,.heif'} onChange={event => { if (event.target.files?.length) void bulk(event.target.files); event.target.value = ''; }}/></label>}</div>
      <div className="admin-table-wrap"><table className="admin-content-table"><thead><tr><th scope="col">名称</th>{columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}<th scope="col">状态</th><th scope="col">更新日期</th><th scope="col">操作</th></tr></thead><tbody>{result.shown.map(row => {
        const data = row.data as Record<string, unknown>, title = recordTitle(row);
        const thumbnail = collectionAssetUrl(kind === 'gallery' ? data.thumb : kind === 'brands' ? data.file : data.cover);
        return <tr key={row.id} tabIndex={busy ? -1 : 0} aria-label={`查看 ${title}`} onClick={() => openDetails(row)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDetails(row); } }}><td><button className="admin-table-title" disabled={busy} onClick={event => { event.stopPropagation(); openDetails(row); }}>{thumbnail && <img className="admin-table-thumbnail" src={thumbnail} alt="" loading="lazy"/>}<strong>{title}</strong></button></td>{columns.map(column => <td key={column.key} title={cellText(data[column.key], column.key)}>{cellText(data[column.key], column.key)}</td>)}<td><span className={`admin-status ${isRecordPublic(row) ? 'is-public' : 'is-private'}`}>{recordStatus(row)}</span></td><td>{row.updatedAt.slice(0, 10)}</td><td><div className="admin-table-tools" onClick={event => event.stopPropagation()}><button aria-label={`上移 ${title}`} title="上移" disabled={busy || items[0] === row} onClick={() => void move(row, -1)}>↑</button><button aria-label={`下移 ${title}`} title="下移" disabled={busy || items.at(-1) === row} onClick={() => void move(row, 1)}>↓</button><button aria-label={`删除 ${title}`} disabled={busy} onClick={() => setDeleting(row)}>删除</button></div></td></tr>;
      })}</tbody></table></div>
      {!result.shown.length && <div className="admin-table-empty"><h2>{items.length ? '没有匹配的内容' : `还没有${RESOURCE_LABELS[kind]}`}</h2><p className="muted">{items.length ? '试试其他关键词或公开状态。' : ['gallery', 'music'].includes(kind) ? '点击“新建”添加内容，也可以批量上传本地文件。' : '点击“新建”添加第一条内容。'}</p></div>}
      <div className="admin-pagination"><span>{result.filtered.length ? `${firstShown}–${lastShown} / ${result.filtered.length}` : '0 条内容'}</span><button className="btn" disabled={!result.page || busy} onClick={() => setPage(result.page - 1)}>上一页</button><span>{result.page + 1} / {result.pages}</span><button className="btn" disabled={result.page + 1 >= result.pages || busy} onClick={() => setPage(result.page + 1)}>下一页</button></div>
    </section>}
    {!editing && <CollectionBusyGuard busy={busy || editorBusy} dirty={dirty}/>}
    {deleting && <div className="admin-dialog" role="alertdialog" aria-label="删除内容确认"><div><h3>删除「{recordTitle(deleting)}」？</h3><p>关联照片会保留，关系会自动解除。文件如被其他内容引用，也会保留。</p><div className="admin-actions"><button className="btn" disabled={busy} onClick={() => setDeleting(null)}>取消</button><button className="btn btn-danger" disabled={busy} onClick={() => void remove()}>确认删除</button></div></div></div>}</>;
}
