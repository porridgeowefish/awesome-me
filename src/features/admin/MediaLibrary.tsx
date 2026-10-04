import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { publicUrl } from '@/shared/lib/url';
import { api, uploadFile } from './api';
import { AssetDialog, MediaAssetDetails } from './MediaAssetDetails';
import { ASSET_PURPOSES, assetPurposeLabel, assetPreviewKind, assetUploadAccept, filterAssets, formatAssetBytes, uploadedLibraryAsset, type AssetPurpose, type LibraryAsset } from './media-library';

const PAGE_SIZE = 60;
type View = 'grid' | 'list';
function initialView(): View {
  try { return localStorage.getItem('site:admin-asset-view') === 'list' ? 'list' : 'grid'; }
  catch { return 'grid'; }
}
function AssetThumbnail({ asset, small = false }: { asset: LibraryAsset; small?: boolean }) {
  const kind = assetPreviewKind(asset);
  return asset.variants.thumb
    ? <img className={small ? 'admin-asset-mini' : 'admin-asset-thumb'} src={publicUrl(asset.variants.thumb)} alt="" loading="lazy" decoding="async" />
    : <span className={`admin-asset-file-icon${small ? ' admin-asset-mini' : ''}`} aria-hidden="true">{kind === 'audio' ? '♫' : kind === 'pdf' ? 'PDF' : 'IMG'}</span>;
}
export function MediaLibrary() {
  const [items, setItems] = useState<LibraryAsset[]>([]), [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''), [purpose, setPurpose] = useState(''), [view, setView] = useState<View>(initialView), [page, setPage] = useState(0);
  const [uploadPurpose, setUploadPurpose] = useState<AssetPurpose>('logo'), [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [selected, setSelected] = useState<LibraryAsset | null>(null), [remove, setRemove] = useState<LibraryAsset | null>(null);
  const [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState('');
  const alive = useRef(false), request = useRef(0), pendingLoad = useRef<AbortController | null>(null);
  const busy = uploading || deleting;
  const blocker = useBlocker(busy);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [busy]);
  async function load() {
    pendingLoad.current?.abort();
    const controller = new AbortController(), sequence = ++request.current;
    pendingLoad.current = controller;
    setLoading(true);
    try {
      const result = await api<{ items: LibraryAsset[] }>('/api/v1/admin/media', { signal: controller.signal });
      if (alive.current && request.current === sequence) { setItems(result.items); setError(''); }
      return result.items;
    } finally { if (alive.current && request.current === sequence) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true;
    void load().catch(reason => { if (alive.current && (reason as Error).name !== 'AbortError') setError((reason as Error).message); });
    return () => { alive.current = false; pendingLoad.current?.abort(); };
  }, []);
  function changeView(next: View) {
    setView(next);
    try { localStorage.setItem('site:admin-asset-view', next); } catch { /* View switching also works without persistent storage. */ }
  }
  async function upload(file: File) {
    const chosenPurpose = uploadPurpose;
    setUploading(true); setError(''); setMessage(`正在上传并处理 ${file.name}…`);
    try {
      const result = await uploadFile(file, chosenPurpose), asset = uploadedLibraryAsset(result, file, chosenPurpose);
      if (!alive.current) return;
      setItems(previous => [asset, ...previous.filter(item => item.id !== asset.id)]);
      setQuery(''); setPurpose(asset.purpose); setPage(0); setSelected(asset);
      setMessage(`已添加「${asset.filename}」。${asset.warnings.length ? asset.warnings.join('；') : '可以在详情中复制地址，供内容编辑时使用。'}`);
      try { await load(); }
      catch (reason) { if (alive.current) setError(`素材已上传，列表刷新失败：${(reason as Error).message}`); }
    } catch (reason) { if (alive.current) { setError((reason as Error).message); setMessage(''); } }
    finally { if (alive.current) setUploading(false); }
  }
  async function discard() {
    if (!remove || deleting) return;
    const asset = remove;
    setDeleting(true); setDeleteError('');
    try {
      await api(`/api/v1/admin/media/${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
      if (!alive.current) return;
      setItems(previous => previous.filter(item => item.id !== asset.id));
      if (selected?.id === asset.id) setSelected(null);
      setRemove(null); setMessage(`已删除「${asset.filename}」。`);
      try { await load(); }
      catch (reason) { if (alive.current) setError(`素材已删除，列表刷新失败：${(reason as Error).message}`); }
    } catch (reason) { if (alive.current) setDeleteError((reason as Error).message); }
    finally { if (alive.current) setDeleting(false); }
  }
  const filtered = filterAssets(items, query, purpose), totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1), shown = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  return <>
    <div className="admin-heading"><div><span className="eyebrow">ASSET LIBRARY</span><h1>素材库</h1><p>Logo、照片、插图、音频和简历统一存放。点击素材查看详情，再将地址用于内容编辑。</p></div></div>
    <div className="admin-assets-upload">
      <label>上传用途<select value={uploadPurpose} disabled={busy} onChange={event => setUploadPurpose(event.target.value as AssetPurpose)}>{ASSET_PURPOSES.map(value => <option key={value} value={value}>{assetPurposeLabel(value)}</option>)}</select></label>
      <label className={`btn btn-primary${busy ? ' is-disabled' : ''}`}>{uploading ? '正在上传…' : '上传素材'}<input type="file" disabled={busy} accept={assetUploadAccept(uploadPurpose)} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file); }} /></label>
      <button type="button" className="btn" disabled={busy || loading} onClick={() => void load().catch(reason => setError((reason as Error).message))}>{loading ? '加载中…' : '刷新素材'}</button>
      <span className="muted">{uploadPurpose === 'music' ? '支持 MP3、MP4 等音频，最大 100 MB。MP4 自动提取音频，不保留画面。' : uploadPurpose === 'resume' ? '支持 PDF，最大 20 MB。' : uploadPurpose === 'logo' ? 'Logo 支持 PNG、JPG、WebP 和 SVG，最大 40 MB。' : '图片支持 PNG、JPG、WebP 等格式，最大 40 MB。'}</span>
    </div>
    {message && <p className="admin-notice" role="status">{message}</p>}{error && <p className="admin-errors" role="alert">{error}</p>}
    <div className="admin-assets-toolbar">
      <label>搜索素材<input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="文件名、用途或素材 ID" /></label>
      <label>用途筛选<select value={purpose} onChange={event => { setPurpose(event.target.value); setPage(0); }}><option value="">全部素材</option>{ASSET_PURPOSES.map(value => <option key={value} value={value}>{assetPurposeLabel(value)}</option>)}</select></label>
      <div className="admin-assets-view-toggle" role="group" aria-label="素材显示方式"><button type="button" className="btn" aria-pressed={view === 'grid'} onClick={() => changeView('grid')}>缩略图</button><button type="button" className="btn" aria-pressed={view === 'list'} onClick={() => changeView('list')}>列表</button></div>
      <span className="admin-assets-count muted">{filtered.length} / {items.length} 个素材</span>
    </div>
    {loading && !items.length ? <p role="status">正在加载素材…</p> : !shown.length ? <div className="admin-assets-empty"><h2>{items.length ? '没有匹配的素材' : '还没有素材'}</h2><p>{items.length ? '试试其他文件名，或切换用途筛选。' : '选择上传用途，再添加第一个 Logo 或文件。'}</p></div>
      : view === 'grid' ? <div className="admin-assets-grid" aria-busy={loading}>{shown.map(asset => <article className="admin-asset-tile" key={asset.id}><button type="button" className="admin-asset-open" onClick={() => setSelected(asset)}><AssetThumbnail asset={asset} /><div className="admin-asset-caption"><strong>{asset.filename}</strong><span>{assetPurposeLabel(asset.purpose)} · {formatAssetBytes(asset.size)}</span></div></button></article>)}</div>
        : <div className="admin-assets-table-wrap" aria-busy={loading}><table className="admin-assets-table admin-table"><thead><tr><th>素材</th><th>用途</th><th>大小</th><th>上传日期</th><th>操作</th></tr></thead><tbody>{shown.map(asset => <tr key={asset.id}><td><button type="button" className="admin-asset-name" onClick={() => setSelected(asset)}><AssetThumbnail asset={asset} small /><span>{asset.filename}</span></button></td><td>{assetPurposeLabel(asset.purpose)}</td><td>{formatAssetBytes(asset.size)}</td><td>{asset.createdAt.slice(0, 10)}</td><td><button type="button" className="btn" onClick={() => setSelected(asset)}>查看</button></td></tr>)}</tbody></table></div>}
    {totalPages > 1 && <div className="admin-pagination"><button type="button" className="btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage + 1} / {totalPages}</span><button type="button" className="btn" disabled={currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
    {selected && !remove && <MediaAssetDetails key={selected.id} asset={selected} onClose={() => setSelected(null)} onDelete={() => { setRemove(selected); setDeleteError(''); }} />}
    {remove && <AssetDialog title={`删除「${remove.filename}」？`} onClose={() => setRemove(null)} busy={deleting} confirmation><p>仅未被内容引用的素材可以删除。正在使用的素材会由服务器拒绝删除。</p>{deleteError && <p className="admin-errors" role="alert">{deleteError}</p>}<div className="admin-asset-detail-footer admin-actions"><button type="button" className="btn" disabled={deleting} onClick={() => setRemove(null)}>保留素材</button><button type="button" className="btn btn-danger" disabled={deleting} onClick={() => void discard()}>{deleting ? '正在删除…' : '确认删除'}</button></div></AssetDialog>}
    {blocker.state === 'blocked' && <div className="admin-dialog" role="alertdialog" aria-label="正在处理素材"><div><h3>正在处理，请稍候</h3><p>等待上传或删除完成后再离开。</p><button type="button" className="btn" onClick={() => blocker.reset()}>继续等待</button></div></div>}
  </>;
}
