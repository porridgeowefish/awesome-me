import { lazy, Suspense, useEffect, useRef } from 'react';
import type { ContentRecord } from '../../contracts/content';
import { FIELD_LABELS } from '../../contracts/editor';
import { cellText, collectionAssetUrl, recordStatus, recordTitle } from './collectionModel';
import { AdminReferences, useAdminReferences } from './References';
const Markdown = lazy(() => import('@/shared/markdown/MarkdownRenderer').then(module => ({ default: module.MarkdownRenderer })));
const assetFields = new Set(['src', 'thumb', 'cover', 'file']);
const proseFields = new Set(['body', 'story', 'note', 'reason', 'summary']);

function FootprintPhotos({ ids }: { ids: string[] }) {
  const { photos } = useAdminReferences();
  return <section className="admin-detail-text"><h3>地区照片 · {ids.length} 张</h3><div className="admin-footprint-photos">{ids.map(id => {
    const photo = photos.find(row => row.id === id);
    if (!photo) return null;
    return <a key={id} href={`#/admin/gallery?id=${encodeURIComponent(id)}`}><img src={collectionAssetUrl(photo.data.thumb)} alt={photo.data.title} loading="lazy"/><span>{photo.data.title}{photo.data.visible ? '' : '（未公开）'}</span></a>;
  })}</div></section>;
}

export function CollectionDetails({ record, onEdit, onClose, disabled }: {
  record: ContentRecord; onEdit: () => void; onClose: () => void; disabled: boolean;
}) {
  const data = record.data as Record<string, unknown>;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [record.id]);
  const image = collectionAssetUrl(record.kind === 'gallery' ? data.src : record.kind === 'brands' ? data.file : data.cover);
  const audio = record.kind === 'music' ? collectionAssetUrl(data.src) : undefined;
  return <section className="admin-detail-panel" aria-label="内容详情">
    <div className="admin-detail-header admin-panel-header"><div><button className="btn" disabled={disabled} onClick={onClose}>← 返回列表</button><h2 ref={heading} tabIndex={-1}>{recordTitle(record)}</h2><span className="muted">{recordStatus(record)} · 版本 {record.revision} · 更新于 {record.updatedAt.slice(0, 10)}</span></div><button className="btn btn-primary" disabled={disabled} onClick={onEdit}>编辑内容</button></div>
    {(image || audio) && <div className="admin-detail-media">{image && <img src={image} alt={recordTitle(record)} loading="lazy"/>}{audio && <audio controls preload="metadata" src={audio}>浏览器无法播放此音频。</audio>}</div>}
    {record.kind === 'footprints' && <AdminReferences><FootprintPhotos ids={data.photos as string[]}/></AdminReferences>}
    <dl className="admin-detail-grid">{Object.entries(data).filter(([key]) => !proseFields.has(key)).map(([key, value]) => <div key={key}><dt>{FIELD_LABELS[key] ?? key}</dt><dd>{assetFields.has(key) && collectionAssetUrl(value) ? <a href={collectionAssetUrl(value)} target="_blank" rel="noopener noreferrer">{String(value)}</a> : cellText(value, key)}</dd></div>)}</dl>
    {Object.entries(data).filter(([key, value]) => proseFields.has(key) && typeof value === 'string' && value).map(([key, value]) => <section className="admin-detail-text" key={key}><h3>{FIELD_LABELS[key] ?? key}</h3>{key === 'body' ? <Suspense fallback={<p className="muted">正在准备正文…</p>}><Markdown source={String(value)} basePath={`content/essays/${String(data.publicPath || 'preview')}/index.md`} needsMath/></Suspense> : <p>{String(value)}</p>}</section>)}
  </section>;
}
